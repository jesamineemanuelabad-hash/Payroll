import { PayrollManagement } from "@/components/payroll/payroll-management";
import { getPayrollDashboard } from "@/lib/data/payroll-queries";

export default async function PayrollPage() {
  const data = await getPayrollDashboard();
  return <PayrollManagement data={data} />;
}
