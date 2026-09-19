import { getPayrollPolicies } from "@/app/actions/payroll-policy";
import { PayrollPolicyManager } from "@/components/payroll/payroll-policy-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PayrollPolicyPage() {
  const result = await getPayrollPolicies();
  let canEdit = false;
  if (result.ok) { const db = await createSupabaseServerClient(); const { data: roles } = await db.rpc("record_roles", {}); canEdit = roles?.includes("super_admin") ?? false; }
  return <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600">Payroll governance</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Payroll policy</h1><p className="mb-7 mt-2 max-w-3xl text-sm leading-6 text-slate-500">Configure effective-dated salary, overtime, statutory cutoff, and payslip comparison rules. Test a draft version before activation.</p>{result.ok?<PayrollPolicyManager policies={result.data} canEdit={canEdit}/>:<p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{result.message}</p>}</div>;
}
