"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { createHmac, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminEnvironment } from "@/lib/supabase/admin";
import { mfaDestination, safeMfaReturnPath } from "@/lib/auth/mfa";
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
    destination = mfaDestination(workspace.roles, workspace.emailMfaVerified ?? false, assurance) ?? destination;
  } catch { return { error: "Unable to reach authentication. Try again." }; }
  revalidatePath("/", "layout");
  redirect(destination);
}

async function requireWorkspaceUser() {
  if (!hasSupabaseEnvironment()) return null;
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.rpc("workspace_session", {});
  const workspace = data as unknown as WorkspaceSession | null;
  return workspace?.active && workspace.roles.length ? { db, user: auth.user, workspace } : null;
}

export type EmailOtpState = { error: string; sent?: boolean; message?: string };

const emailOtpSchema = z.object({
  intent: z.enum(["send", "verify"]),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the six-digit code.").optional(),
  next: z.string().optional(),
});

function sessionIdFromAccessToken(accessToken: string) {
  const payloadPart = accessToken.split(".")[1];
  if (!payloadPart) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as { session_id?: unknown };
    const parsedSessionId = z.string().uuid().safeParse(payload.session_id);
    return parsedSessionId.success ? parsedSessionId.data : null;
  } catch {
    return null;
  }
}

function emailCodeHash(code: string, userId: string, sessionId: string) {
  const secret = process.env.EMAIL_OTP_HASH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Email OTP hash secret is not configured.");
  return createHmac("sha256", secret).update(`${userId}:${sessionId}:${code}`).digest("hex");
}

function createEmailTransport() {
  const user = process.env.EMAIL_SMTP_USER;
  const password = process.env.EMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
  const host = process.env.EMAIL_SMTP_HOST;
  const port = Number(process.env.EMAIL_SMTP_PORT ?? "587");
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!user || !password || !host || !from || ![465, 587].includes(port)) {
    throw new Error("Email SMTP settings are incomplete.");
  }
  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass: password },
      tls: { minVersion: "TLSv1.2" },
    }),
  };
}

export async function emailOtpChallenge(_state: EmailOtpState, form: FormData): Promise<EmailOtpState> {
  const parsed = emailOtpSchema.safeParse({
    intent: form.get("intent"),
    code: form.get("code") || undefined,
    next: form.get("next"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid verification code.", sent: true };
  if (!hasSupabaseEnvironment()) return { error: "Configure Supabase before email verification." };

  try {
    const context = await requireWorkspaceUser();
    if (!context) return { error: "Your session expired. Sign in again." };
    if (!context.workspace.mfaRequired && context.workspace.authenticatorAssuranceLevel !== "aal2") {
      return { error: "This account does not require email verification. Sign in again." };
    }
    const email = context.user.email;
    if (!email || !context.user.email_confirmed_at) {
      return { error: "A confirmed work email is required. Contact your administrator." };
    }
    if (!hasSupabaseAdminEnvironment()) {
      return { error: "Email verification is not configured on the server. Contact your administrator." };
    }
    const { data: sessionData, error: sessionError } = await context.db.auth.getSession();
    if (sessionError || !sessionData.session) return { error: "Your sign-in session expired. Sign in again." };
    const sessionId = sessionIdFromAccessToken(sessionData.session.access_token);
    if (!sessionId) return { error: "Your sign-in session could not be verified. Sign in again." };
    const admin = createSupabaseAdminClient();
    if (parsed.data.intent === "send") {
      const code = String(randomInt(100000, 1000000));
      const codeHash = emailCodeHash(code, context.user.id, sessionId);
      const { data: status, error: issueError } = await admin.rpc("issue_login_email_otp", {
        p_user_id: context.user.id,
        p_session_id: sessionId,
        p_code_hash: codeHash,
      });
      if (issueError) {
        console.error("Email OTP issuance failed", { code: issueError.code ?? "UNKNOWN" });
        return { error: "Could not prepare the email code. Try again." };
      }
      if (status === "cooldown") return { error: "Please wait 60 seconds before requesting another code.", sent: _state.sent };
      if (status !== "issued") return { error: "Could not prepare the email code. Try again." };
      try {
        const { from, transport } = createEmailTransport();
        await transport.sendMail({
          from: { name: "Payroll & Benefits", address: from },
          to: email,
          subject: "Your Payroll & Benefits verification code",
          text: `Your verification code is ${code}. It expires in 90 seconds. If you did not request it, you can ignore this email.`,
          html: `<p>Your Payroll &amp; Benefits verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 90 seconds. If you did not request it, you can ignore this email.</p>`,
        });
      } catch (cause) {
        const { error: invalidateError } = await admin.rpc("invalidate_login_email_otp", {
          p_user_id: context.user.id,
          p_session_id: sessionId,
          p_code_hash: codeHash,
        });
        if (invalidateError) console.error("Failed to invalidate an undelivered email OTP", { code: invalidateError.code ?? "UNKNOWN" });
        const errorCode = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "UNKNOWN";
        console.error("Email OTP delivery failed", { code: errorCode });
        return { error: "Could not send the email. Check SMTP settings and try again." };
      }
      return { error: "", sent: true, message: "A verification code was sent to your registered email." };
    }

    if (!parsed.data.code) return { error: "Enter the six-digit code.", sent: true };
    const { data: status, error: verifyError } = await admin.rpc("verify_login_email_otp", {
      p_user_id: context.user.id,
      p_session_id: sessionId,
      p_code_hash: emailCodeHash(parsed.data.code, context.user.id, sessionId),
    });
    if (verifyError) {
      console.error("Email OTP verification failed", { code: verifyError.code ?? "UNKNOWN" });
      return { error: "Could not verify the code. Try again.", sent: true };
    }
    if (status !== "verified") {
      const message = status === "expired" ? "The code expired. Request a new one." : status === "locked" ? "Too many incorrect attempts. Request a new code." : "The code is incorrect or was already used.";
      return { error: message, sent: true };
    }

    revalidatePath("/", "layout");
    redirect(safeMfaReturnPath(parsed.data.next));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: "Unable to complete email verification. Try again.", sent: _state.sent };
  }
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
