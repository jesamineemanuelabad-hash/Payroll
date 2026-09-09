"use server";

import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient, hasAdminSetupEnvironment } from "@/lib/supabase/admin";

export type AdminSetupState = { error: string; success: string };

const setupSchema = z.object({
  setupToken: z.string().min(1),
  employeeNumber: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12, "Use at least 12 characters.").max(128),
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

function matchesSetupToken(received: string, expected: string) {
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function createFirstAdmin(_state: AdminSetupState, form: FormData): Promise<AdminSetupState> {
  if (!hasAdminSetupEnvironment()) {
    return { error: "Administrator setup is not configured. Add the service key and ADMIN_SETUP_TOKEN to .env.local, then restart the server.", success: "" };
  }

  const expectedToken = process.env.ADMIN_SETUP_TOKEN!;
  if (expectedToken.length < 32) {
    return { error: "ADMIN_SETUP_TOKEN must contain at least 32 characters.", success: "" };
  }

  const parsed = setupSchema.safeParse({
    setupToken: form.get("setupToken"),
    employeeNumber: form.get("employeeNumber"),
    firstName: form.get("firstName"),
    lastName: form.get("lastName"),
    email: form.get("email"),
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Review the administrator details.", success: "" };
  }
  if (!matchesSetupToken(parsed.data.setupToken, expectedToken)) {
    return { error: "The private setup token is incorrect.", success: "" };
  }

  const admin = createSupabaseAdminClient();
  const { count, error: countError } = await admin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "super_admin");
  if (countError) return { error: "Unable to check administrator setup. Apply the latest database migration and try again.", success: "" };
  if ((count ?? 0) > 0) return { error: "The first administrator has already been created. Sign in or ask an existing administrator for access.", success: "" };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { first_name: parsed.data.firstName, last_name: parsed.data.lastName },
  });
  if (createError || !created.user) {
    return { error: createError?.message.includes("already") ? "An authentication account already uses this email." : "The administrator authentication account could not be created.", success: "" };
  }

  const { error: profileError } = await admin.rpc("bootstrap_first_admin", {
    p_user_id: created.user.id,
    p_employee_number: parsed.data.employeeNumber,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_email: parsed.data.email,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message.includes("already") ? "The first administrator has already been created." : "The administrator profile could not be created. The login account was rolled back.", success: "" };
  }

  return { error: "", success: "Administrator created. You can now sign in with this email and password." };
}
