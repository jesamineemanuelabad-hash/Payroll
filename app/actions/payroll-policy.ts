"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const policySchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(3).max(120), version: z.string().trim().min(3).max(80),
  effectiveFrom: z.string().date(), effectiveTo: z.union([z.string().date(), z.literal("")]), status: z.enum(["draft", "active", "retired"]),
  workdaysPerMonth: z.number().min(1).max(31), hoursPerDay: z.number().min(1).max(24),
  ordinaryOtMultiplier: z.number().min(1).max(10), restDayOtMultiplier: z.number().min(1).max(10),
  specialDayOtMultiplier: z.number().min(1).max(10), regularHolidayOtMultiplier: z.number().min(1).max(10),
  doubleHolidayOtMultiplier: z.number().min(1).max(10), nightDifferentialRate: z.number().min(0).max(1),
  contributionAllocation: z.enum(["split_evenly", "first_cutoff", "second_cutoff"]), comparisonTolerance: z.number().min(0).max(10000),
  sssEmployeeRate: z.number().min(0).max(1), sssEmployerRate: z.number().min(0).max(1), sssMinMsc: z.number().min(0), sssMaxMsc: z.number().min(0),
  philhealthRate: z.number().min(0).max(1), philhealthFloor: z.number().min(0), philhealthCeiling: z.number().min(0),
  pagibigLowRate: z.number().min(0).max(1), pagibigHighRate: z.number().min(0).max(1), pagibigEmployerRate: z.number().min(0).max(1), pagibigRateThreshold: z.number().min(0), pagibigSalaryCap: z.number().min(0),
}).superRefine((value, context) => {
  if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) context.addIssue({ code: "custom", path: ["effectiveTo"], message: "Must be on or after the effective start." });
  if (value.sssMaxMsc < value.sssMinMsc) context.addIssue({ code: "custom", path: ["sssMaxMsc"], message: "Must be at least the SSS minimum MSC." });
  if (value.philhealthCeiling < value.philhealthFloor) context.addIssue({ code: "custom", path: ["philhealthCeiling"], message: "Must be at least the PhilHealth floor." });
});

export type PayrollPolicyInput = z.infer<typeof policySchema>;
export type PayrollPolicyRow = {
  id: string; name: string; version: string; effective_from: string; effective_to: string | null; status: "draft" | "active" | "retired";
  workdays_per_month: number; hours_per_day: number; ordinary_ot_multiplier: number; rest_day_ot_multiplier: number;
  special_day_ot_multiplier: number; regular_holiday_ot_multiplier: number; double_holiday_ot_multiplier: number;
  night_differential_rate: number; contribution_allocation: "split_evenly" | "first_cutoff" | "second_cutoff"; comparison_tolerance: number;
  sss_employee_rate: number; sss_employer_rate: number; sss_min_msc: number; sss_max_msc: number; philhealth_rate: number; philhealth_floor: number; philhealth_ceiling: number;
  pagibig_low_rate: number; pagibig_high_rate: number; pagibig_employer_rate: number; pagibig_rate_threshold: number; pagibig_salary_cap: number;
};

export async function getPayrollPolicies(): Promise<{ ok: true; data: PayrollPolicyRow[] } | { ok: false; message: string }> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the configurable payroll policy migration." };
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("payroll_policy_snapshot", {});
    return error ? { ok: false, message: error.message } : { ok: true, data: data as unknown as PayrollPolicyRow[] };
  } catch { return { ok: false, message: "Unable to load payroll policies." }; }
}

export async function savePayrollPolicy(input: PayrollPolicyInput): Promise<{ ok: true; data: PayrollPolicyRow } | { ok: false; message: string; fields?: Record<string, string[]> }> {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the payroll policy values.", fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before saving payroll policy." };
  const { id, ...policy } = parsed.data;
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("save_payroll_policy", { p_policy: policy as unknown as Json, p_id: id ?? null });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/payroll-policy");
    return { ok: true, data: data as unknown as PayrollPolicyRow };
  } catch { return { ok: false, message: "Unable to save payroll policy." }; }
}
