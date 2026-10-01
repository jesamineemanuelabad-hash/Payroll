"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveRecord } from "@/app/actions/records";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { createPayrollRunSchema, type CreatePayrollRunInput } from "@/lib/validations/payroll";
import type { PayrollRunReport, PayrollStatus, PayrollThirteenthMonthSnapshot } from "@/types/payroll";

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

export async function deleteDraftPayrollRun(runId: string): Promise<{ ok: true; deletedEntries: number } | { ok: false; message: string }> {
  if (!z.string().uuid().safeParse(runId).success) return { ok: false, message: "Invalid payroll run." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before deleting a payroll run." };

  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };

    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: roleError.message };
    if (!roles?.some((role) => ["super_admin", "payroll_manager"].includes(role))) {
      return { ok: false, message: "Your role cannot delete payroll runs." };
    }

    const { data: run, error: runError } = await db
      .from("payroll_runs")
      .select("id, status, updated_at")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return { ok: false, message: runError.message };
    if (!run) return { ok: false, message: "Payroll run not found. Refresh the payroll list." };
    if (run.status !== "draft") return { ok: false, message: "Only draft payroll runs can be deleted." };

    const { data: items, error: itemsError } = await db
      .from("payroll_items")
      .select("id, updated_at")
      .eq("payroll_run_id", runId);
    if (itemsError) return { ok: false, message: itemsError.message };

    for (const item of items) {
      const { error } = await db.rpc("mutate_record", {
        p_entity: "payroll_items",
        p_operation: "delete",
        p_data: {},
        p_id: item.id,
        p_version: item.updated_at,
      });
      if (error) {
        revalidatePath("/payroll-benefits/payroll");
        return { ok: false, message: `The draft run remains, but a calculated employee entry could not be removed: ${error.message}` };
      }
    }

    const { data: currentRun, error: currentRunError } = await db
      .from("payroll_runs")
      .select("status, updated_at")
      .eq("id", runId)
      .maybeSingle();
    if (currentRunError) return { ok: false, message: `Calculated entries were removed, but the draft run could not be reloaded: ${currentRunError.message}` };
    if (!currentRun) return { ok: false, message: "Calculated entries were removed, but the draft run no longer exists." };
    if (currentRun.status !== "draft") return { ok: false, message: "Calculated entries were removed, but the run is no longer a draft and cannot be deleted." };

    const { error: deleteError } = await db.rpc("mutate_record", {
      p_entity: "payroll_runs",
      p_operation: "delete",
      p_data: {},
      p_id: runId,
      p_version: currentRun.updated_at,
    });
    if (deleteError) {
      revalidatePath("/payroll-benefits/payroll");
      return { ok: false, message: `Calculated entries were removed, but the draft run could not be deleted: ${deleteError.message}` };
    }

    revalidatePath("/payroll-benefits/payroll");
    revalidatePath("/overview");
    return { ok: true, deletedEntries: items.length };
  } catch {
    return { ok: false, message: "Unable to delete the draft payroll run. Refresh the payroll list before retrying." };
  }
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
    if (error) return { ok: false, message: error.message };
    const report = data as unknown as PayrollRunReport;
    const { data: claims, error: claimsError } = await db
      .from("claims")
      .select("id,employee_id,claim_number,category,expense_date,description,amount")
      .eq("included_payroll_run_id", runId)
      .order("expense_date")
      .order("claim_number");
    if (claimsError) return { ok: false, message: `Payroll loaded, but included claims could not be loaded: ${claimsError.message}` };
    const claimsByEmployee = new Map<string, NonNullable<PayrollRunReport["items"][number]["claims"]>>();
    for (const claim of claims) {
      const employeeClaims = claimsByEmployee.get(claim.employee_id) ?? [];
      employeeClaims.push({
        id: claim.id,
        claimNumber: claim.claim_number,
        category: claim.category,
        expenseDate: claim.expense_date,
        description: claim.description,
        amount: Number(claim.amount),
      });
      claimsByEmployee.set(claim.employee_id, employeeClaims);
    }
    return {
      ok: true,
      data: {
        ...report,
        items: report.items.map((item) => ({ ...item, claims: claimsByEmployee.get(item.employeeId) ?? [] })),
      },
    };
  } catch { return { ok: false, message: "Unable to load the payroll report." }; }
}

export async function getPayrollThirteenthMonthSnapshot(year: number): Promise<{ ok: true; data: PayrollThirteenthMonthSnapshot } | { ok: false; message: string }> {
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) return { ok: false, message: "Select a valid completed or current payroll year." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the payroll calculation views migration." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("payroll_13th_month_snapshot", { p_year: year });
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: data as unknown as PayrollThirteenthMonthSnapshot };
  } catch {
    return { ok: false, message: "Unable to load 13th-month payroll data." };
  }
}

const transitionTargets = z.enum(["draft", "pending_approval"]);

export async function transitionPayrollRun(runId: string, target: "draft" | "pending_approval"): Promise<{ ok: true; status: PayrollStatus } | { ok: false; message: string }> {
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
