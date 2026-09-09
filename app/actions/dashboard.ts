"use server";

import { format, subDays } from "date-fns";
import { revalidatePath } from "next/cache";
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
    const { data, error } = await db.rpc("dashboard_snapshot", {
      p_months: filters.months,
      p_department_id: filters.departmentId,
      p_location: filters.location,
      p_employment_type: filters.employmentType,
    });
    if (error) return { ok: false, message: dashboardError(error) };
    const snapshot = liveDashboardSchema.safeParse(data);
    if (!snapshot.success) return { ok: false, message: "The database returned an invalid reporting snapshot. Apply the latest migration." };
    return { ok: true, data: snapshot.data };
  } catch {
    return { ok: false, message: "Unable to reach the live reporting database." };
  }
}

export async function runAttendanceScoring(): Promise<{ ok: boolean; message: string }> {
  if (!process.env.XGBOOST_SERVICE_URL || !process.env.XGBOOST_SERVICE_TOKEN) {
    return { ok: false, message: "Configure XGBOOST_SERVICE_URL and XGBOOST_SERVICE_TOKEN on the server first." };
  }
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before running attendance scoring." };

  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
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

    const artifactReference = new URL(process.env.XGBOOST_SERVICE_URL).origin;
    const { error: saveError } = await db.rpc("save_attendance_predictions", {
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
    revalidatePath("/overview");
    revalidatePath("/payroll-benefits/analytics");
    return { ok: true, message: `${predictions.length} attendance records were scored and saved.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Attendance scoring failed." };
  }
}
