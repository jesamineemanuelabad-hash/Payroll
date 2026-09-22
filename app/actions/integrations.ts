"use server";

import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

const syncResponseSchema = z.object({ employees: z.number().int().nonnegative(), attendance: z.number().int().nonnegative(), compensation: z.number().int().nonnegative(), approvedRequests: z.number().int().nonnegative(), exceptions: z.number().int().nonnegative() });

export type EssSyncResult = { ok: true; demo: boolean; counts: z.infer<typeof syncResponseSchema> } | { ok: false; message: string };

export async function synchronizeEssRecords(): Promise<EssSyncResult> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Configure Supabase and sign in before synchronization." };
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { ok: false, message: "Sign in before synchronization." };
  const { data: roles, error } = await db.rpc("record_roles", {});
  if (error || !roles?.some((role) => ["super_admin", "hr_admin", "payroll_manager"].includes(role))) return { ok: false, message: "Your role cannot synchronize HR2 records." };
  const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") return { ok: false, message: "Complete multi-factor authentication before synchronizing ESS records." };
  const endpoint = process.env.ESS_SYNC_WEBHOOK_URL;
  const token = process.env.ESS_API_TOKEN;
  if (!endpoint || !token) {
    return { ok: false, message: "The external ESS synchronization service is not configured. No records were imported." };
  }
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ scopes: ["employees", "attendance", "compensation", "approved_requests"] }), cache: "no-store" });
    if (!response.ok) return { ok: false, message: `HR2 synchronization failed with status ${response.status}.` };
    const parsed = syncResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, message: "HR2 returned an unexpected synchronization response." };
    return { ok: true, demo: false, counts: parsed.data };
  } catch {
    return { ok: false, message: "The HR2 integration service could not be reached." };
  }
}
