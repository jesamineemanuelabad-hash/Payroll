"use server";

import { z } from "zod";

const syncResponseSchema = z.object({ employees: z.number().int().nonnegative(), attendance: z.number().int().nonnegative(), compensation: z.number().int().nonnegative(), approvedRequests: z.number().int().nonnegative(), exceptions: z.number().int().nonnegative() });

export type EssSyncResult = { ok: true; demo: boolean; counts: z.infer<typeof syncResponseSchema> } | { ok: false; message: string };

export async function synchronizeEssRecords(): Promise<EssSyncResult> {
  const endpoint = process.env.ESS_SYNC_WEBHOOK_URL;
  const token = process.env.ESS_API_TOKEN;
  if (!endpoint || !token) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return { ok: true, demo: true, counts: { employees: 248, attendance: 5428, compensation: 248, approvedRequests: 12, exceptions: 1 } };
  }
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ scopes: ["employees", "attendance", "compensation", "approved_requests"] }), cache: "no-store" });
    if (!response.ok) return { ok: false, message: `ESS synchronization failed with status ${response.status}.` };
    const parsed = syncResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { ok: false, message: "ESS returned an unexpected synchronization response." };
    return { ok: true, demo: false, counts: parsed.data };
  } catch {
    return { ok: false, message: "The ESS integration service could not be reached." };
  }
}
