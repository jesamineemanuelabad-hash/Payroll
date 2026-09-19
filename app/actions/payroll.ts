"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveRecord } from "@/app/actions/records";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { createPayrollRunSchema, type CreatePayrollRunInput } from "@/lib/validations/payroll";
import type { PayrollRunReport, PayrollStatus } from "@/types/payroll";

export type PayrollActionResult = { ok: true; id: string; demo: boolean } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollActionResult> {
  const parsed = createPayrollRunSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  const result = await saveRecord({ entity: "payroll_runs", values: { period_start: parsed.data.periodStart, period_end: parsed.data.periodEnd, pay_date: parsed.data.payDate } });
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fields };
  if (parsed.data.includeActiveEmployees) {
    const calculated = await calculatePayrollRun(result.data.id);
    if (!calculated.ok) return { ok: false, message: `The draft was created, but calculation failed: ${calculated.message}` };
  }
  return { ok: true, id: result.data.id, demo: false };
}

export type PayrollOperationResult = { ok: true; employees: number; ruleVersion: string } | { ok: false; message: string };
export type PayrollValidation = { passed: boolean; issues: Array<{ severity: string; code: string; message: string }>; comparisons: Array<{ employeeId: string; sourceReference: string; grossDifference: number; deductionDifference: number; netDifference: number; passed: boolean }> };

export async function calculatePayrollRun(runId: string): Promise<PayrollOperationResult> {
  if (!z.string().uuid().safeParse(runId).success) return { ok: false, message: "Invalid payroll run." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the payroll engine migration first." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("calculate_payroll_run_complete", { p_run_id: runId });
    if (error) return { ok: false, message: error.message };
    const result = data as unknown as { employees: number; ruleVersion: string };
    revalidatePath(`/payroll-benefits/payroll/${runId}`);
    revalidatePath("/payroll-benefits/payroll");
    return { ok: true, employees: result.employees, ruleVersion: result.ruleVersion };
  } catch { return { ok: false, message: "Unable to calculate payroll. Refresh before retrying." }; }
}

export async function validatePayrollRun(runId: string): Promise<{ ok: true; data: PayrollValidation } | { ok: false; message: string }> {
  if (!z.string().uuid().safeParse(runId).success) return { ok: false, message: "Invalid payroll run." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the configurable payroll policy migration." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("validate_payroll_run", { p_run_id: runId });
    if (error) return { ok: false, message: error.message };
    revalidatePath(`/payroll-benefits/payroll/${runId}`);
    return { ok: true, data: data as unknown as PayrollValidation };
  } catch { return { ok: false, message: "Unable to validate payroll." }; }
}

export async function getPayrollRunReport(runId: string): Promise<{ ok: true; data: PayrollRunReport } | { ok: false; message: string }> {
  if (!z.string().uuid().safeParse(runId).success) return { ok: false, message: "Invalid payroll run." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to generate a payroll report." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("payroll_run_report", { p_run_id: runId });
    return error ? { ok: false, message: error.message } : { ok: true, data: data as unknown as PayrollRunReport };
  } catch { return { ok: false, message: "Unable to load the payroll report." }; }
}

const transitionTargets = z.enum(["draft", "pending_approval", "approved", "paid"]);

export async function transitionPayrollRun(runId: string, target: PayrollStatus): Promise<{ ok: true; status: PayrollStatus } | { ok: false; message: string }> {
  const parsed = z.object({ runId: z.string().uuid(), target: transitionTargets }).safeParse({ runId, target });
  if (!parsed.success) return { ok: false, message: "Invalid payroll transition." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the operational workflow migration first." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("transition_payroll_run", { p_run_id: parsed.data.runId, p_target: parsed.data.target });
    if (error) return { ok: false, message: error.code === "PGRST202" ? "Apply the operational workflow migration first." : error.message };
    const saved = data as unknown as { status: PayrollStatus };
    revalidatePath(`/payroll-benefits/payroll/${runId}`);
    revalidatePath("/payroll-benefits/payroll");
    revalidatePath("/overview");
    return { ok: true, status: saved.status };
  } catch {
    return { ok: false, message: "Unable to update payroll status. Refresh before retrying." };
  }
}
