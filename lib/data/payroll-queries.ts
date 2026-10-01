import { format, parseISO } from "date-fns";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { PayrollDashboardData, PayrollRun } from "@/types/payroll";

function buildMetrics(runs: PayrollRun[]) {
  const current = runs[0];
  const pending = runs.filter((run) => run.status === "pending_approval").length;
  const completed = runs.filter((run) => run.status === "paid").length;

  return [
    { label: "Latest net payroll", value: current ? formatCurrency(current.netPay) : "—", helper: current ? `${format(parseISO(current.periodStart), "MMM d")}–${format(parseISO(current.periodEnd), "MMM d, yyyy")}` : "No payroll runs" },
    { label: "Employees in latest run", value: String(current?.employees ?? 0), helper: current ? "Saved payroll entries" : "No payroll entries" },
    { label: "Awaiting approval", value: String(pending), helper: "Payroll runs in review", tone: pending ? "warning" as const : "default" as const },
    { label: "Paid payroll runs", value: String(completed), helper: "Runs marked paid", tone: completed ? "success" as const : "default" as const },
  ];
}

export async function getPayrollDashboard(): Promise<PayrollDashboardData> {
  if (!hasSupabaseEnvironment()) {
    const runs: PayrollRun[] = [];
    return { runs, metrics: buildMetrics(runs), lastUpdated: new Date().toISOString(), isConfigured: false };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("id, period_start, period_end, pay_date, employee_count, total_gross, total_deductions, total_contributions, total_net, status, updated_at")
    .order("period_start", { ascending: false });

  if (error) throw new Error(`Unable to load payroll runs: ${error.message}`);

  const runs: PayrollRun[] = data.map((row) => ({
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    payDate: row.pay_date,
    employees: row.employee_count,
    grossPay: Number(row.total_gross),
    deductions: Number(row.total_deductions),
    contributions: Number(row.total_contributions),
    netPay: Number(row.total_net),
    status: row.status,
    updatedAt: row.updated_at,
  }));

  return { runs, metrics: buildMetrics(runs), lastUpdated: new Date().toISOString(), isConfigured: true };
}
