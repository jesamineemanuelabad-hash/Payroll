import { format, parseISO } from "date-fns";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { samplePayrollRuns } from "@/lib/data/payroll-sample";
import { formatCurrency } from "@/lib/utils";
import type { PayrollDashboardData, PayrollRun } from "@/types/payroll";

function buildMetrics(runs: PayrollRun[]) {
  const current = runs.find((run) => run.status === "pending_approval" || run.status === "processing") ?? runs[0];
  const pending = runs.filter((run) => ["draft", "processing", "pending_approval", "approved"].includes(run.status)).length;
  const completed = runs.filter((run) => run.status === "paid").length;
  const next = [...runs].filter((run) => new Date(run.payDate) >= new Date("2026-08-28")).sort((a, b) => a.payDate.localeCompare(b.payDate))[0];

  return [
    { label: "Total payroll", value: formatCurrency(current?.netPay ?? 0), helper: "Current pay period", trend: { value: "3.2%", direction: "up" as const } },
    { label: "Employees included", value: String(current?.employees ?? 0), helper: "3 awaiting review", trend: { value: "+4", direction: "neutral" as const } },
    { label: "Pending payroll", value: String(pending), helper: "Requires your attention", tone: "warning" as const },
    { label: "Completed payroll", value: String(completed), helper: "In the last 6 months", tone: "success" as const },
    { label: "Next payroll date", value: next ? format(parseISO(next.payDate), "MMM d, yyyy") : "Not scheduled", helper: next ? `${Math.max(0, Math.ceil((new Date(next.payDate).getTime() - new Date("2026-08-28").getTime()) / 86400000))} days remaining` : "Create a payroll run" },
  ];
}

export async function getPayrollDashboard(): Promise<PayrollDashboardData> {
  if (!hasSupabaseEnvironment()) {
    return { runs: samplePayrollRuns, metrics: buildMetrics(samplePayrollRuns), lastUpdated: "2026-08-28T06:45:00Z", isDemo: true };
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

  return { runs, metrics: buildMetrics(runs), lastUpdated: new Date().toISOString(), isDemo: false };
}
