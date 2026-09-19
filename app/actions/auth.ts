"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { mfaDestination, normalizeTotpQrCode, safeMfaReturnPath } from "@/lib/auth/mfa";
import type { WorkspaceSession } from "@/types/payroll";

export async function signIn(_state: { error: string }, form: FormData) {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  if (!hasSupabaseEnvironment()) return { error: "Configure Supabase before signing in." };
  let destination: Route = "/overview";
  try {
    const db = await createSupabaseServerClient();
    const { error } = await db.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Sign-in failed. Check your email, password, and account confirmation." };
    const { data: session, error: accessError } = await db.rpc("workspace_session", {});
    const workspace = session as unknown as WorkspaceSession | null;
    if (accessError || !workspace?.active || !workspace.roles.length) {
      await db.auth.signOut();
      return { error: accessError?.code === "PGRST202" ? "Apply the operational workflow migration before signing in." : "This workspace account is inactive or has no assigned role. Contact your administrator." };
    }
    const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || !assurance) {
      await db.auth.signOut();
      return { error: "Your security status could not be verified. Try signing in again." };
    }
    destination = mfaDestination(workspace.roles, assurance) ?? destination;
  } catch { return { error: "Unable to reach authentication. Try again." }; }
  revalidatePath("/", "layout");
  redirect(destination);
}

export type MfaActionState = { error: string };
export type MfaEnrollmentState = MfaActionState & { factorId?: string; qrCode?: string; secret?: string };

async function requireWorkspaceUser() {
  if (!hasSupabaseEnvironment()) return null;
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.rpc("workspace_session", {});
  const workspace = data as unknown as WorkspaceSession | null;
  return workspace?.active && workspace.roles.length ? { db, workspace } : null;
}

export async function beginTotpEnrollment(_state: MfaEnrollmentState): Promise<MfaEnrollmentState> {
  void _state;
  try {
    const context = await requireWorkspaceUser();
    if (!context) return { error: "Your session expired. Sign in again." };
    const { data: factors, error: factorsError } = await context.db.auth.mfa.listFactors();
    if (factorsError || !factors) return { error: "Your authenticator status could not be loaded. Try again." };
    if ((factors?.totp.length ?? 0) > 0) {
      const { data: assurance, error: assuranceError } = await context.db.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError || assurance?.currentLevel !== "aal2") return { error: "Verify your existing authenticator before adding another one." };
    }
    for (const factor of factors?.all ?? []) {
      if (factor.factor_type === "totp" && factor.status === "unverified") {
        await context.db.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    const { data, error } = await context.db.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Payroll & Benefits authenticator",
      issuer: "Payroll & Benefits",
    });
    if (error) return { error: error.message };
    const qrCode = normalizeTotpQrCode(data.totp.qr_code);
    return { error: "", factorId: data.id, qrCode, secret: data.totp.secret };
  } catch {
    return { error: "Unable to start authenticator enrollment. Try again." };
  }
}

const mfaCodeSchema = z.object({
  factorId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code."),
  next: z.string().optional(),
});

export async function verifyTotp(_state: MfaActionState, form: FormData): Promise<MfaActionState> {
  const parsed = mfaCodeSchema.safeParse({ factorId: form.get("factorId"), code: form.get("code"), next: form.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid verification code." };
  let destination: Route = safeMfaReturnPath(parsed.data.next);
  try {
    const context = await requireWorkspaceUser();
    if (!context) return { error: "Your session expired. Sign in again." };
    const { error } = await context.db.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
    if (error) return { error: "The code is invalid or expired. Wait for a new code and try again." };
    if (destination === "/overview") destination = "/overview?mfa=verified";
  } catch {
    return { error: "Unable to verify the authenticator code. Try again." };
  }
  revalidatePath("/", "layout");
  redirect(destination);
}

export async function removeTotpFactor(_state: MfaActionState, form: FormData): Promise<MfaActionState> {
  const parsed = z.object({ factorId: z.string().uuid() }).safeParse({ factorId: form.get("factorId") });
  if (!parsed.success) return { error: "Invalid authenticator." };
  try {
    const context = await requireWorkspaceUser();
    if (!context) return { error: "Your session expired. Sign in again." };
    const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
      context.db.auth.mfa.getAuthenticatorAssuranceLevel(),
      context.db.auth.mfa.listFactors(),
    ]);
    if (assuranceError || factorsError || !factors) return { error: "Your authenticator status could not be verified. Try again." };
    if (assurance?.currentLevel !== "aal2") return { error: "Verify an authenticator before removing one." };
    const verified = factors?.totp ?? [];
    const required = context.workspace.mfaRequired ?? context.workspace.roles.some((role) => ["super_admin", "hr_admin", "payroll_manager", "hr_manager"].includes(role));
    if (required && verified.length <= 1) return { error: "Your role requires MFA. Add and verify another authenticator before removing this one." };
    if (!verified.some((factor) => factor.id === parsed.data.factorId)) return { error: "The authenticator is no longer available." };
    const { error } = await context.db.auth.mfa.unenroll({ factorId: parsed.data.factorId });
    if (error) return { error: error.message };
  } catch {
    return { error: "Unable to remove the authenticator. Try again." };
  }
  revalidatePath("/mfa/setup");
  revalidatePath("/settings/profile");
  redirect("/mfa/setup?removed=1");
}

export async function signOut() {
  if (hasSupabaseEnvironment()) {
    const db = await createSupabaseServerClient();
    const { error } = await db.auth.signOut();
    if (error) throw new Error("Sign-out failed. Please try again.");
  }
  revalidatePath("/", "layout");
  redirect("/login?signedOut=1");
}
