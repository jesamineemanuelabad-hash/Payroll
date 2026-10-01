import { getPayrollRunReport, getPayrollThirteenthMonthSnapshot } from "@/app/actions/payroll";
import { getPayrollPolicies } from "@/app/actions/payroll-policy";
import { PayrollWorkspace } from "@/components/payroll/payroll-workspace";
import { getRecordPageAccess } from "@/components/records/record-page";
import { getPayrollDashboard } from "@/lib/data/payroll-queries";

export default async function Page() {
  const dashboard = await getPayrollDashboard();
  const [access, policyResult, reportResult, thirteenthMonthResult] = await Promise.all([
    getRecordPageAccess(),
    getPayrollPolicies(),
    dashboard.runs[0] ? getPayrollRunReport(dashboard.runs[0].id) : Promise.resolve(null),
    getPayrollThirteenthMonthSnapshot(new Date().getFullYear()),
  ]);

  return <PayrollWorkspace
    dashboard={dashboard}
    roles={access.roles}
    initialReport={reportResult?.ok ? reportResult.data : null}
    reportError={reportResult && !reportResult.ok ? reportResult.message : null}
    policies={policyResult.ok ? policyResult.data : []}
    policyError={policyResult.ok ? null : policyResult.message}
    thirteenthMonth={thirteenthMonthResult.ok ? thirteenthMonthResult.data : null}
    thirteenthMonthError={thirteenthMonthResult.ok ? null : thirteenthMonthResult.message}
  />;
}
