"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Banknote, Calculator, FileSpreadsheet, Printer, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { calculatePayrollRun, getPayrollRunReport, transitionPayrollRun } from "@/app/actions/payroll";
import { Button } from "@/components/ui/button";
import { exportRecordsToExcel, type ExportColumn } from "@/lib/export-records";
import type { ExportRecord } from "@/types/operations";
import type { PayrollStatus } from "@/types/payroll";

const columns: ExportColumn[] = [
  { key: "employeeNumber", label: "Employee ID", width: 16 }, { key: "employeeName", label: "Employee", width: 28 },
  { key: "department", label: "Department", width: 20 }, { key: "salaryFrequency", label: "Pay Basis", width: 15 },
  { key: "workedDays", label: "Worked Days", width: 14, format: "number" }, { key: "paidLeaveDays", label: "Paid Leave Days", width: 16, format: "number" },
  { key: "lateMinutes", label: "Late Minutes", width: 14, format: "number" }, { key: "overtimeMinutes", label: "OT Minutes", width: 14, format: "number" },
  { key: "basicSalary", label: "Basic Pay", width: 16, format: "currency" }, { key: "allowances", label: "Allowances", width: 16, format: "currency" },
  { key: "overtimePay", label: "Overtime Pay", width: 16, format: "currency" }, { key: "bonus", label: "Bonus", width: 16, format: "currency" },
  { key: "reimbursements", label: "Reimbursements", width: 18, format: "currency" }, { key: "grossPay", label: "Gross Pay", width: 16, format: "currency" },
  { key: "lateDeduction", label: "Late Deduction", width: 17, format: "currency" }, { key: "absenceDeduction", label: "Absence Deduction", width: 19, format: "currency" },
  { key: "sssEmployee", label: "SSS", width: 14, format: "currency" }, { key: "philhealthEmployee", label: "PhilHealth", width: 16, format: "currency" },
  { key: "withholdingTax", label: "BIR Withholding", width: 18, format: "currency" }, { key: "otherDeductions", label: "Other Deductions", width: 18, format: "currency" },
  { key: "totalDeductions", label: "Total Deductions", width: 18, format: "currency" }, { key: "netPay", label: "Net Pay", width: 16, format: "currency" },
];

const pretty = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

export function PayrollRunActions({ runId, status, calculatedAt, employeeCount, roles }: {
  runId: string;
  status: PayrollStatus;
  calculatedAt: string | null;
  employeeCount: number;
  roles: string[];
}) {
  const [busy, startTransition] = useTransition();
  const router = useRouter();
  const canCalculate = roles.some((role) => ["super_admin", "payroll_manager"].includes(role));
  const canApprove = roles.some((role) => ["super_admin", "hr_admin"].includes(role));

  function calculate() {
    startTransition(async () => {
      const result = await calculatePayrollRun(runId);
      if (!result.ok) { toast.error("Payroll calculation failed", { description: result.message }); return; }
      toast.success("Payroll calculated", { description: `${result.employees} employees · ${result.ruleVersion}` });
      router.refresh();
    });
  }

  function transition(target: PayrollStatus, success: string) {
    startTransition(async () => {
      const result = await transitionPayrollRun(runId, target);
      if (!result.ok) { toast.error("Payroll workflow update failed", { description: result.message }); return; }
      toast.success(success);
      router.refresh();
    });
  }

  function exportExcel() {
    startTransition(async () => {
      const result = await getPayrollRunReport(runId);
      if (!result.ok) { toast.error("Excel export failed", { description: result.message }); return; }
      const records = result.data.items.map((item) => ({ ...item }) as unknown as ExportRecord);
      await exportRecordsToExcel(`payroll-${result.data.run.period_start}-${result.data.run.period_end}`, "Payroll Register", columns, records);
      toast.success("Payroll register exported", { description: `${records.length} employee rows included.` });
    });
  }

  return <div className="mt-4 flex flex-wrap gap-2 rounded-xl border bg-white p-4">
    <div className="mb-2 basis-full"><p className="text-sm font-semibold text-slate-900">Payroll workflow</p><p className="mt-1 text-xs text-slate-500">Status: <span className="font-medium text-indigo-700">{pretty(status)}</span>{calculatedAt ? ` · calculated ${new Date(calculatedAt).toLocaleString()}` : " · not calculated"} · {employeeCount} employees</p></div>
    {status === "draft" && canCalculate && <Button onClick={calculate} disabled={busy}><Calculator className={busy ? "animate-pulse" : ""} />{busy ? "Working…" : calculatedAt ? "Recalculate payroll" : "Calculate payroll"}</Button>}
    {status === "draft" && canCalculate && <Button variant="secondary" onClick={() => transition("pending_approval", "Payroll submitted for approval.")} disabled={busy || !calculatedAt || employeeCount === 0}><Send />Submit for approval</Button>}
    {status === "pending_approval" && canApprove && <Button onClick={() => transition("approved", "Payroll approved and locked from editing.")} disabled={busy}><BadgeCheck />Approve payroll</Button>}
    {status === "pending_approval" && roles.some((role) => ["super_admin", "hr_admin", "payroll_manager"].includes(role)) && <Button variant="secondary" onClick={() => transition("draft", "Payroll returned to draft for revision.")} disabled={busy}><RotateCcw />Return to draft</Button>}
    {status === "approved" && canCalculate && <Button onClick={() => transition("paid", "Payroll marked as paid.")} disabled={busy}><Banknote />Mark as paid</Button>}
    <Button variant="secondary" onClick={exportExcel} disabled={busy}><FileSpreadsheet />Export detailed Excel</Button>
    <Button variant="secondary" asChild><Link href={`/payroll-benefits/payroll/${runId}/print`} target="_blank"><Printer />Print payroll & payslips</Link></Button>
    <p className="basis-full text-xs leading-5 text-slate-500">Calculation includes period salary, paid leave, late/undertime/absence deductions, regular-day overtime, SSS, PhilHealth, BIR withholding, active benefit costs, approved reimbursements, and approved compensation bonuses. Submitted and approved runs are locked from entry edits.</p>
  </div>;
}
