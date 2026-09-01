"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowLeft, Check, ChevronDown, CircleAlert, Download, FileText, MoreHorizontal, RefreshCw, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { PayrollStatusBadge, ReviewStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/lib/utils";
import type { PayrollEmployee, PayrollRun } from "@/types/payroll";

const tabs = ["Overview", "Employees", "Earnings", "Deductions", "Contributions", "Audit Trail"] as const;
type Tab = (typeof tabs)[number];

function EmployeeActions({ employee }: { employee: PayrollEmployee }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${employee.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => toast.info(`Opening ${employee.name}’s payroll breakdown`)}><FileText />View breakdown</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.info("Adjustment editor opened in demo mode")}><CircleAlert />Edit adjustment</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.success(`${employee.name} recalculated`)}><RefreshCw />Recalculate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toast.success("Payslip prepared for download")}><Download />View payslip</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmployeeTable({ employees }: { employees: PayrollEmployee[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1380px] text-left text-sm">
        <thead className="bg-slate-50/80 text-xs font-medium text-slate-500">
          <tr>{["Employee", "Employee ID", "Department", "Basic salary", "Allowances", "Overtime", "Attendance adj.", "Benefits", "Reimbursements", "Gross pay", "Deductions", "Net pay", "Status", ""].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {employees.map((employee, index) => (
            <tr key={employee.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
              <td className="h-[68px] px-4"><div className="flex min-w-[170px] items-center gap-3"><span className={`grid size-8 place-items-center rounded-full text-[11px] font-semibold ${index % 3 === 0 ? "bg-violet-100 text-violet-700" : index % 3 === 1 ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>{employee.initials}</span><span className="font-medium text-slate-900">{employee.name}</span></div></td>
              <td className="px-4 text-xs font-medium text-slate-500">{employee.employeeId}</td>
              <td className="px-4 text-slate-600">{employee.department}</td>
              {[employee.basicSalary, employee.allowances, employee.overtime].map((amount, amountIndex) => <td className="whitespace-nowrap px-4 tabular-nums text-slate-600" key={amountIndex}>{formatCurrency(amount)}</td>)}
              <td className={`whitespace-nowrap px-4 tabular-nums ${employee.attendanceAdjustments < 0 ? "text-red-600" : "text-slate-600"}`}>{formatCurrency(employee.attendanceAdjustments)}</td>
              <td className="whitespace-nowrap px-4 tabular-nums text-slate-600">{formatCurrency(employee.benefits)}</td>
              <td className="whitespace-nowrap px-4 tabular-nums text-emerald-700">{formatCurrency(employee.reimbursements)}</td>
              <td className="whitespace-nowrap px-4 tabular-nums text-slate-600">{formatCurrency(employee.grossPay)}</td>
              <td className="whitespace-nowrap px-4 tabular-nums text-slate-600">{formatCurrency(employee.deductions)}</td>
              <td className="whitespace-nowrap px-4 font-medium tabular-nums text-slate-900">{formatCurrency(employee.netPay)}</td>
              <td className="px-4"><ReviewStatusBadge needsReview={employee.status === "needs_review"} /></td>
              <td className="px-4"><EmployeeActions employee={employee} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayrollTabContent({ tab, run, employees }: { tab: Exclude<Tab, "Employees">; run: PayrollRun; employees: PayrollEmployee[] }) {
  if (tab === "Audit Trail") {
    return <section className="mt-5 rounded-xl border bg-white"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Payroll audit trail</h2><p className="mt-1 text-xs text-slate-500">Immutable workflow and calculation events</p></div><div className="divide-y divide-slate-100">{[{ action: "Payroll submitted for approval", actor: "Andrea Morales", time: "Today, 2:45 PM" }, { action: "Benefits and reimbursements applied", actor: "Payroll integration", time: "Today, 2:32 PM" }, { action: "Attendance adjustments calculated", actor: "Attendance engine", time: "Today, 2:28 PM" }, { action: "Salary and employee records synchronized", actor: "ESS integration", time: "Today, 2:21 PM" }, { action: "Payroll draft created", actor: "Andrea Morales", time: "Aug 26, 9:10 AM" }].map((event) => <div className="flex items-center gap-3 px-5 py-4" key={event.action}><span className="size-2 rounded-full bg-indigo-500 ring-4 ring-indigo-50" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{event.action}</p><p className="mt-0.5 text-xs text-slate-500">{event.actor}</p></div><time className="text-xs text-slate-400">{event.time}</time></div>)}</div></section>;
  }
  const attendance = Math.abs(employees.reduce((sum, employee) => sum + employee.attendanceAdjustments, 0));
  const reimbursements = employees.reduce((sum, employee) => sum + employee.reimbursements, 0);
  const benefits = employees.reduce((sum, employee) => sum + employee.benefits, 0);
  const overtime = employees.reduce((sum, employee) => sum + employee.overtime, 0);
  const content = tab === "Earnings" ? [
    ["Basic salary", run.grossPay * 0.78, "248 synchronized compensation records"], ["Allowances", run.grossPay * 0.11, "Recurring and approved allowances"], ["Overtime and premium pay", overtime * 41, "Approved attendance-derived hours"], ["Reimbursements", reimbursements * 8.4, "Verified ESS claims"],
  ] : tab === "Deductions" ? [
    ["Withholding tax", run.deductions * 0.63, "BIR withholding computation"], ["SSS employee share", run.deductions * 0.14, "Current statutory contribution table"], ["PhilHealth employee share", run.deductions * 0.09, "Current statutory contribution table"], ["Pag-IBIG and employee loans", run.deductions * 0.14, "Mandatory and authorized deductions"],
  ] : tab === "Contributions" ? [
    ["SSS employer share", run.contributions * 0.49, "Including employee compensation contribution"], ["PhilHealth employer share", run.contributions * 0.27, "Matched employer contribution"], ["Pag-IBIG employer share", run.contributions * 0.14, "Mandatory employer contribution"], ["Benefits and insurance", run.contributions * 0.10, "Approved employer-paid coverage"],
  ] : [
    ["ESS records synchronized", run.employees, "Employee and effective salary records"], ["Attendance adjustments", attendance, "Late, undertime, absence, and overtime"], ["Benefits applied", benefits, "Approved eligible benefits"], ["Reimbursements included", reimbursements, "Verified employee claims"],
  ];
  const total = content.reduce((sum, item) => sum + Number(item[1]), 0);
  return <section className="mt-5 overflow-hidden rounded-xl border bg-white"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">{tab === "Overview" ? "Calculation readiness" : `${tab} breakdown`}</h2><p className="mt-1 text-xs text-slate-500">{tab === "Overview" ? "Source data applied to this payroll run" : "Computed amounts across all included employees"}</p></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">{content.map(([label, amount, helper]) => <div className="bg-white p-5" key={String(label)}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{tab === "Overview" && label === "ESS records synchronized" ? `${amount} records` : formatCurrency(Number(amount))}</p><p className="mt-1 text-xs leading-5 text-slate-400">{helper}</p>{tab !== "Overview" && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(7, (Number(amount) / total) * 100)}%` }} /></div>}</div>)}</div></section>;
}

export function PayrollRunDetail({ run, employees }: { run: PayrollRun; employees: PayrollEmployee[] }) {
  const [activeTab, setActiveTab] = useState<Tab>("Employees");
  const needsReview = employees.filter((employee) => employee.status === "needs_review").length;

  return (
    <div>
      <Link href="/payroll-benefits/payroll" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" />Back to payroll runs</Link>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">Payroll Run — {format(parseISO(run.periodStart), "MMMM d")}–{format(parseISO(run.periodEnd), "d, yyyy")}</h1>
            <PayrollStatusBadge status={run.status} />
          </div>
          <p className="mt-1.5 text-sm text-slate-500">Payment scheduled for {format(parseISO(run.payDate), "MMMM d, yyyy")} · {run.employees} employees included</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => toast.success("Payroll register downloaded")}><Download />Download register</Button>
          <Button onClick={() => toast.success("Payroll submitted for approval", { description: "Approvers have been notified." })}><UserRoundCheck />Submit for approval</Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem><RefreshCw />Recalculate all</DropdownMenuItem><DropdownMenuItem><FileText />View run settings</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </div>

      <div className="mt-6 grid overflow-hidden rounded-xl border bg-white sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Gross payroll", formatCurrency(run.grossPay), "Employee earnings"],
          ["Total deductions", formatCurrency(run.deductions), "Tax, loans & benefits"],
          ["Employer contributions", formatCurrency(run.contributions), "SSS, PhilHealth & Pag-IBIG"],
          ["Net payroll", formatCurrency(run.netPay), "Scheduled disbursement"],
        ].map(([label, value, helper]) => <div className="border-r p-5 last:border-r-0" key={label}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{helper}</p></div>)}
      </div>

      <div className="mt-6 border-b border-slate-200">
        <div className="flex gap-6 overflow-x-auto" role="tablist" aria-label="Payroll run sections">
          {tabs.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} role="tab" aria-selected={activeTab === tab} className={`relative h-11 shrink-0 text-sm font-medium ${activeTab === tab ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab}{tab === "Employees" && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{run.employees}</span>}</button>)}
        </div>
      </div>

      {activeTab === "Employees" ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between border-b px-4 py-3.5"><div><h2 className="text-sm font-semibold text-slate-900">Employee payroll</h2><p className="mt-0.5 text-xs text-slate-500">Review earnings and deductions before approval</p></div><Button variant="secondary" size="sm">Filter employees<ChevronDown /></Button></div>
            <EmployeeTable employees={employees} />
          </section>
          <aside className="h-fit rounded-xl border bg-white p-5 xl:sticky xl:top-24">
            <h2 className="text-sm font-semibold text-slate-900">Run readiness</h2>
            <div className="mt-4 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="size-4" /></span><div><p className="text-sm font-medium text-slate-800">{run.employees - needsReview} ready</p><p className="text-xs text-slate-500">No issues detected</p></div></div>
            <div className="mt-3 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-amber-50 text-amber-600"><CircleAlert className="size-4" /></span><div><p className="text-sm font-medium text-slate-800">{needsReview} needs review</p><p className="text-xs text-slate-500">Adjustment is above threshold</p></div></div>
            <div className="my-5 h-px bg-slate-100" />
            <dl className="space-y-3 text-xs"><div className="flex justify-between"><dt className="text-slate-500">Period</dt><dd className="font-medium text-slate-700">Semi-monthly</dd></div><div className="flex justify-between"><dt className="text-slate-500">Prepared by</dt><dd className="font-medium text-slate-700">Andrea Morales</dd></div><div className="flex justify-between"><dt className="text-slate-500">Last calculated</dt><dd className="font-medium text-slate-700">Today, 2:45 PM</dd></div></dl>
          </aside>
        </div>
      ) : <PayrollTabContent tab={activeTab} run={run} employees={employees} />}
    </div>
  );
}
