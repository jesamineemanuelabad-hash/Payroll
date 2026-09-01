"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { createPayrollRunSchema, type CreatePayrollRunInput } from "@/lib/validations/payroll";

export type PayrollActionResult = { ok: true; id: string; demo: boolean } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function createPayrollRun(input: CreatePayrollRunInput): Promise<PayrollActionResult> {
  const parsed = createPayrollRunSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Review the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (!hasSupabaseEnvironment()) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return { ok: true, id: crypto.randomUUID(), demo: true };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { ok: false, message: "Your session expired. Sign in and try again." };

  const { data, error } = await supabase
    .from("payroll_runs")
    .insert({
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      pay_date: parsed.data.payDate,
      created_by: authData.user.id,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  revalidatePath("/payroll-benefits/payroll");
  return { ok: true, id: data.id, demo: false };
}
