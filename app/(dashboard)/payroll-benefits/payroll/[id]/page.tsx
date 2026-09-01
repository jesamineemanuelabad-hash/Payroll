import { notFound } from "next/navigation";
import { PayrollRunDetail } from "@/components/payroll/payroll-run-detail";
import { samplePayrollEmployees } from "@/lib/data/payroll-sample";
import { getPayrollDashboard } from "@/lib/data/payroll-queries";

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dashboard = await getPayrollDashboard();
  const run = dashboard.runs.find((item) => item.id === id);
  if (!run) notFound();
  return <PayrollRunDetail run={run} employees={samplePayrollEmployees} />;
}
