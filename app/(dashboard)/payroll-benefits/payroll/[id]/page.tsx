import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPayrollRunReport } from "@/app/actions/payroll";
import { PayrollRunWorkspace } from "@/components/payroll/payroll-run-workspace";
import { getRecordPageAccess } from "@/components/records/record-page";

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [result, access] = await Promise.all([getPayrollRunReport(id), getRecordPageAccess()]);
  if (result.ok) return <PayrollRunWorkspace report={result.data} roles={access.roles} />;
  if (result.message.includes("Payroll run not found")) notFound();
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><Link href="/payroll-benefits/payroll" className="text-sm font-medium text-indigo-600">← Back to payroll</Link><div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5"><h1 className="font-semibold text-amber-950">Payroll report unavailable</h1><p className="mt-2 text-sm text-amber-800">{result.message}</p></div></main>;
}
