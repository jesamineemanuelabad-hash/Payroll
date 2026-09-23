"use server";

import { format, subDays } from "date-fns";
import { attendanceFeatureSchema } from "@/lib/analytics/xgboost-contract";
import { scoreAttendanceWithXgboost } from "@/lib/analytics/xgboost-service";
import { dashboardFiltersSchema, liveDashboardSchema, type DashboardFilters, type LiveDashboardData } from "@/lib/dashboard/schema";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type DashboardResult =
  | { ok: true; data: LiveDashboardData }
  | { ok: false; message: string };

function dashboardError(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Your account does not have permission to view organization reporting.";
  if (error.code === "PGRST202" || error.code === "42883") return "Live reporting is not installed. Apply migration 202609060002_live_reporting.sql.";
  return error.message;
}

export async function loadLiveDashboard(input: DashboardFilters): Promise<DashboardResult> {
  const parsed = dashboardFiltersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid dashboard filters." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to load live dashboard records." };

  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const filters = parsed.data;
    const parameters = { p_months: filters.months, p_department_id: filters.departmentId, p_location: filters.location, p_employment_type: filters.employmentType };
    const [dashboard, accuracy] = await Promise.all([
      db.rpc("dashboard_snapshot", parameters),
      db.rpc("analytics_accuracy_snapshot", parameters),
    ]);
    if (dashboard.error) return { ok: false, message: dashboardError(dashboard.error) };
    if (accuracy.error) return { ok: false, message: accuracy.error.code === "PGRST202" || accuracy.error.code === "42883" ? "Apply migration 202609230001_analytics_accuracy.sql to enable accurate attendance and deduction analytics." : dashboardError(accuracy.error) };
    const snapshot = liveDashboardSchema.safeParse({ ...(dashboard.data as object), accuracy: accuracy.data });
    if (!snapshot.success) return { ok: false, message: "The database returned an invalid reporting snapshot. Apply the latest migration." };
    return { ok: true, data: snapshot.data };
  } catch {
    return { ok: false, message: "Unable to reach the live reporting database." };
  }
}

type AutomaticScoringResult = { status: "completed" | "up_to_date" | "busy" | "retry_later" | "no_data" | "unavailable"; message: string };

export async function runAutomaticAttendanceScoring(): Promise<AutomaticScoringResult> {
  if (!process.env.XGBOOST_SERVICE_URL || !process.env.XGBOOST_SERVICE_TOKEN) {
    return { status: "unavailable", message: "Automatic AI scoring requires XGBOOST_SERVICE_URL and XGBOOST_SERVICE_TOKEN on the server." };
  }
  if (!hasSupabaseEnvironment()) return { status: "unavailable", message: "Connect Supabase before running attendance scoring." };

  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { status: "unavailable", message: "Your session expired. Sign in again." };
    const { data: claim, error: claimError } = await db.rpc("claim_automatic_attendance_scoring", {});
    if (claimError) return { status: "unavailable", message: claimError.code === "PGRST202" ? "Apply the automatic attendance scoring migration." : claimError.code === "42501" ? "An HR or super administrator runs automatic scoring; saved results are available to your role." : claimError.message };
    const claimed = claim as unknown as { status: string; token?: string };
    if (claimed.status !== "claimed") {
      const messages: Record<string, string> = {
        up_to_date: "Model results are current for the saved attendance records.",
        busy: "Attendance scoring is already running in another session.",
        retry_later: "Automatic scoring will retry shortly after the last attempt.",
        no_data: "Add attendance records to enable automatic scoring.",
      };
      return { status: claimed.status as AutomaticScoringResult["status"], message: messages[claimed.status] ?? "Unable to start automatic scoring." };
    }
    if (!claimed.token) return { status: "unavailable", message: "Scoring lease was not issued." };

    try {
      const result = await scoreClaimedAttendance(db);
      const { data: finished, error: finishError } = await db.rpc("finish_automatic_attendance_scoring", { p_token: claimed.token, p_success: result.ok, p_model_run_id: result.modelRunId ?? null });
      if (finishError || !finished) return { status: "unavailable", message: "The scoring lease expired; refresh analytics to load the latest saved results." };
      return result.ok ? { status: "completed", message: result.message } : { status: "unavailable", message: result.message };
    } catch (error) {
      await db.rpc("finish_automatic_attendance_scoring", { p_token: claimed.token, p_success: false });
      return { status: "unavailable", message: error instanceof Error ? error.message : "Attendance scoring failed." };
    }
  } catch {
    return { status: "unavailable", message: "Unable to contact the automatic scoring database." };
  }
}

type ScoringDatabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function scoreClaimedAttendance(db: ScoringDatabase): Promise<{ ok: boolean; message: string; modelRunId?: string }> {
  try {
    const to = format(new Date(), "yyyy-MM-dd");
    const from = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const { data, error } = await db.rpc("attendance_scoring_features", { p_from: from, p_to: to });
    if (error) return { ok: false, message: dashboardError(error) };
    const features = attendanceFeatureSchema.array().safeParse(data);
    if (!features.success) return { ok: false, message: "Attendance features failed validation." };
    if (!features.data.length) return { ok: false, message: "No attendance records are available in the last 30 days." };

    const modelResult = await scoreAttendanceWithXgboost(features.data);
    const predictions = modelResult.predictions;
    if (!predictions.length) return { ok: false, message: "The model returned no predictions." };
    const requestedIds = new Set(features.data.map((item) => item.attendanceRecordId));
    if (predictions.some((item) => !requestedIds.has(item.attendanceRecordId))) {
      return { ok: false, message: "The model returned predictions for unrequested attendance records." };
    }
    const versions = new Set(predictions.map((item) => item.modelVersion));
    if (versions.size !== 1 || !versions.has(modelResult.modelVersion)) return { ok: false, message: "The model returned inconsistent version information." };

    const artifactReference = new URL(process.env.XGBOOST_SERVICE_URL!).origin;
    const { data: modelRunId, error: saveError } = await db.rpc("save_attendance_predictions", {
      p_from: from,
      p_to: to,
      p_model_version: modelResult.modelVersion,
      p_validation_accuracy: modelResult.validationAccuracy ?? null,
      p_artifact_reference: artifactReference,
      p_predictions: predictions.map((prediction) => ({
        attendanceRecordId: prediction.attendanceRecordId,
        classification: prediction.classification,
        classProbability: prediction.classProbability,
        anomalyScore: prediction.anomalyScore,
        anomalyReasons: prediction.anomalyReasons,
      })) as Json,
    });
    if (saveError) return { ok: false, message: dashboardError(saveError) };
    return { ok: true, message: `${predictions.length} attendance records were scored and saved.`, modelRunId: modelRunId ?? undefined };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Attendance scoring failed." };
  }
}
