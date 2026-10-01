"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdminClient, hasSupabaseAdminEnvironment } from "@/lib/supabase/admin";
import { hrAnalyticsFiltersSchema, hrAnalyticsSnapshotSchema, type HrAnalyticsFilters, type HrAnalyticsSnapshot } from "@/lib/dashboard/hr-schema";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type HrAnalyticsResult =
  | { ok: true; data: HrAnalyticsSnapshot }
  | { ok: false; message: string };

export type HrAnalyticsAccessResult = { ok: true; expiresAt: number } | { ok: false; message: string };
type HrAnalyticsLockResult = { ok: true } | { ok: false; message: string };

const passwordSchema = z.string().min(1).max(128);

function sessionIdFromAccessToken(accessToken: string) {
  const payloadPart = accessToken.split(".")[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { session_id?: unknown };
    const parsed = z.string().uuid().safeParse(payload.session_id);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function currentHrAnalyticsSession() {
  if (!hasSupabaseEnvironment()) return { ok: false as const, message: "Connect Supabase to open HR Analytics." };
  const db = await createSupabaseServerClient();
  const [{ data: auth, error: authError }, { data: sessionData, error: sessionError }, { data: workspaceData, error: workspaceError }] = await Promise.all([
    db.auth.getUser(),
    db.auth.getSession(),
    db.rpc("workspace_session", {}),
  ]);
  if (authError || !auth.user) return { ok: false as const, message: "Your session expired. Sign in again." };
  if (sessionError || !sessionData.session) return { ok: false as const, message: "Your session could not be verified. Sign in again." };
  if (workspaceError) return { ok: false as const, message: "Your workspace access could not be verified." };
  const sessionId = sessionIdFromAccessToken(sessionData.session.access_token);
  if (!sessionId) return { ok: false as const, message: "Your session could not be verified. Sign in again." };
  const workspace = workspaceData as { active?: boolean; roles?: string[] } | null;
  if (!workspace?.active || !workspace.roles?.some((role) => ["super_admin", "hr_admin", "hr_manager", "payroll_manager"].includes(role))) {
    return { ok: false as const, message: "Your account does not have permission to view HR Analytics." };
  }
  return { ok: true as const, db, user: auth.user, sessionId };
}

export async function unlockHrAnalytics(input: unknown): Promise<HrAnalyticsAccessResult> {
  const parsedPassword = passwordSchema.safeParse(input);
  if (!parsedPassword.success) return { ok: false, message: "Enter your account password." };
  if (!hasSupabaseAdminEnvironment()) return { ok: false, message: "HR Analytics password verification is not configured on the server." };

  try {
    const context = await currentHrAnalyticsSession();
    if (!context.ok) return context;
    if (!context.user.email) return { ok: false, message: "Your account has no email address for password verification." };

    const authClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );
    const { data: verified, error: passwordError } = await authClient.auth.signInWithPassword({
      email: context.user.email,
      password: parsedPassword.data,
    });
    if (passwordError || verified.user?.id !== context.user.id) {
      return { ok: false, message: "Password is incorrect. Try again." };
    }
    if (!verified.session) return { ok: false, message: "Password verification did not produce a valid session. Try again." };

    const verifiedAt = new Date();
    const admin = createSupabaseAdminClient();
    const { error: revokeError } = await admin.auth.admin.signOut(verified.session.access_token, "local");
    if (revokeError) return { ok: false, message: "Password was checked, but verification could not be safely completed. Try again." };
    const { error } = await admin
      .from("hr_analytics_access_grants")
      .upsert({
        user_id: context.user.id,
        session_id: context.sessionId,
        verified_at: verifiedAt.toISOString(),
        expires_at: new Date(verifiedAt.getTime() + 15 * 60 * 1000).toISOString(),
      });
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return { ok: false, message: "Apply migration 202610010011_hr_analytics_password_gate.sql to enable password protection." };
      return { ok: false, message: "Your password was verified, but HR Analytics could not be unlocked." };
    }
    return { ok: true, expiresAt: verifiedAt.getTime() + 15 * 60 * 1000 };
  } catch {
    return { ok: false, message: "Unable to verify your password right now. Try again." };
  }
}

export async function lockHrAnalytics(): Promise<HrAnalyticsLockResult> {
  if (!hasSupabaseAdminEnvironment()) return { ok: false, message: "HR Analytics access control is not configured on the server." };
  try {
    const context = await currentHrAnalyticsSession();
    if (!context.ok) return context;
    const { error } = await createSupabaseAdminClient()
      .from("hr_analytics_access_grants")
      .delete()
      .eq("user_id", context.user.id)
      .eq("session_id", context.sessionId);
    if (error) return { ok: false, message: "HR Analytics could not be locked. Try again." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Unable to lock HR Analytics right now. Try again." };
  }
}

export async function loadHrAnalytics(input: HrAnalyticsFilters): Promise<HrAnalyticsResult> {
  const parsed = hrAnalyticsFiltersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid HR analytics filters." };
  const context = await currentHrAnalyticsSession();
  if (!context.ok) return context;

  try {
    const filters = parsed.data;
    const { data: hasAccess, error: accessError } = await context.db.rpc("has_hr_analytics_access", {});
    if (accessError) {
      if (accessError.code === "PGRST202" || accessError.code === "42883") return { ok: false, message: "Apply migration 202610010011_hr_analytics_password_gate.sql to protect HR Analytics." };
      return { ok: false, message: accessError.message };
    }
    if (!hasAccess) return { ok: false, message: "Enter your password to unlock HR Analytics." };

    const { data, error } = await context.db.rpc("hr_analytics_snapshot", {
      p_months: filters.months,
      p_department_id: filters.departmentId,
      p_location: filters.location,
      p_employment_type: filters.employmentType,
    });
    if (error) {
      if (error.code === "42501") return { ok: false, message: "Your account does not have permission to view HR analytics." };
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, message: "Apply migration 202610010010_hr_workforce_analytics.sql to enable HR analytics." };
      return { ok: false, message: error.message };
    }

    const snapshot = hrAnalyticsSnapshotSchema.safeParse(data);
    if (!snapshot.success) return { ok: false, message: "The database returned an invalid HR analytics snapshot. Apply the latest migration." };
    return { ok: true, data: snapshot.data };
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : "Unable to reach the HR analytics database." };
  }
}
