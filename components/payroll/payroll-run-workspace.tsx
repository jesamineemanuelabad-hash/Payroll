"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { PayrollRunActions } from "@/components/payroll/payroll-run-actions";
import { PayrollStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import type { PayrollReportItem, PayrollRunReport } from "@/types/payroll";

type DetailTab = "Employees" | "Contributions" | "Tax";
const detailTabs: DetailTab[] = ["Employees", "Contributions", "Tax"];
const currency = (value: number) => formatCurrency(value);
const pretty = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function PayslipDialog({ item, report, onClose }: { item: PayrollReportItem | null; report: PayrollRunReport; onClose: () => void }) {
  return <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-5 sm:p-7">
      {item && <>
        <header className="border-b border-slate-200 pb-4 pr-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">Priority Handling Logistics, Inc.</p>
              <DialogTitle className="mt-1 text-xl">Employee payslip</DialogTitle>
              <DialogDescription>{report.run.period_start} – {report.run.period_end} · Pay date {report.run.pay_date}</DialogDescription>
            </div>
            <span className="w-fit rounded-md bg-indigo-50 px-3 py-2 text-center text-[10px] font-semibold uppercase leading-4 tracking-wide text-indigo-800">Official payslip<br />Payroll record</span>
          </div>
        </header>
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-3">
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Employee</p><p className="mt-1 font-semibold text-slate-950">{item.employeeName}</p><p className="text-xs text-slate-500">ID: {item.employeeNumber}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Department</p><p className="mt-1 font-medium text-slate-900">{item.department}</p><p className="text-xs text-slate-500">Pay basis: {pretty(item.salaryFrequency)}</p></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rates & attendance</p><p className="mt-1 font-medium text-slate-900">{currency(item.dailyRate)} / day</p><p className="text-xs text-slate-500">{currency(item.hourlyRate)} / hour · {item.workedDays} worked · {item.paidLeaveDays} paid leave</p></div>
        </div>
        <div className="grid gap-4 pt-1 md:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-emerald-200">
            <h3 className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">Itemized earnings <span className="text-[10px] font-medium text-emerald-700">(PHP)</span></h3>
            <dl className="space-y-0 px-4 text-sm">
              {[
                ["Basic pay", item.basicSalary], ["Allowances", item.allowances], [`Overtime (${item.overtimeMinutes} min)`, item.overtimePay],
                [`Night differential (${item.nightMinutes} min)`, item.nightDifferential], ["Bonus", item.bonus], ["Benefits", item.benefits],
                ["Reimbursements", item.reimbursements],
              ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0"><dt className="text-slate-600">{label}</dt><dd className="whitespace-nowrap font-medium tabular-nums text-slate-900">{currency(Number(amount))}</dd></div>)}
              <div className="flex justify-between border-t border-emerald-200 py-3 font-semibold text-slate-950"><dt>Gross pay</dt><dd>{currency(item.grossPay)}</dd></div>
            </dl>
          </section>
          <section className="overflow-hidden rounded-xl border border-rose-200">
            <h3 className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">Statutory & other deductions <span className="text-[10px] font-medium text-rose-700">(PHP)</span></h3>
            <dl className="space-y-0 px-4 text-sm">
              {[
                [`Late (${item.lateMinutes} min)`, item.lateDeduction], [`Undertime (${item.undertimeMinutes} min)`, item.undertimeDeduction], [`Absence (${(item.absenceMinutes / 480).toLocaleString(undefined, { maximumFractionDigits: 2 })} days · ${item.absenceMinutes} min)`, item.absenceDeduction],
                ["SSS employee share", item.sssEmployee], ["PhilHealth employee share", item.philhealthEmployee],
                ["Pag-IBIG employee share", item.pagibigEmployee], ["BIR withholding tax", item.withholdingTax],
                ["Benefit deductions", item.benefitDeduction], ["Other deductions", item.otherDeductions],
              ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0"><dt className="text-slate-600">{label}</dt><dd className="whitespace-nowrap font-medium tabular-nums text-rose-600">−{currency(Number(amount))}</dd></div>)}
              <div className="flex justify-between border-t border-rose-200 py-3 font-semibold text-rose-700"><dt>Total deductions</dt><dd>−{currency(item.totalDeductions)}</dd></div>
            </dl>
          </section>
        </div>
        <div className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1 text-xs leading-5 text-slate-600">
            <p><span className="font-semibold text-slate-800">Calculation basis:</span> {item.workedDays} worked days, {item.paidLeaveDays} paid leave days, {item.overtimeMinutes} overtime minutes, {item.nightMinutes} night differential minutes.</p>
            {item.calculation?.missingAttendanceTreatedAsWeekdayAbsence && <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">No attendance was recorded for this cutoff. {item.calculation.assumedAbsenceDays ?? item.absenceMinutes / 480} weekdays were treated as absent; approved paid leave was excluded.{item.calculation.absenceDeductionCapped ? " The absence deduction was capped so total deductions do not exceed gross pay." : ""}</p>}
            <p>Taxable compensation: {item.taxableCompensation == null ? "Not recorded" : currency(item.taxableCompensation)} · Policy: {report.run.policy_name ?? report.run.rule_version ?? "Not recorded"}</p>
            <p>Employer contributions (not deducted from net pay): {currency(item.employerContributions)}{Number(item.calculation?.hmoEmployerCost) > 0 ? ` · HMO employer cost: ${currency(Number(item.calculation?.hmoEmployerCost))}` : ""}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-5 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Net take-home pay</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{currency(item.netPay)}</p>
            <p className="mt-1 text-[10px] text-emerald-800">{currency(item.grossPay)} gross − {currency(item.totalDeductions)} deductions</p>
          </div>
        </div>
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close payslip</Button></div>
      </>}
    </DialogContent>
  </Dialog>;
}

export function PayrollRunWorkspace({ report, roles }: { report: PayrollRunReport; roles: string[] }) {
  const [active, setActive] = useState<DetailTab>("Employees");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PayrollReportItem | null>(null);
  const { run, items } = report;
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => !query || `${item.employeeName} ${item.employeeNumber} ${item.department}`.toLowerCase().includes(query));
  }, [items, search]);

  return <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
    <Link href="/payroll-benefits/payroll" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-800"><ArrowLeft className="size-4" />Back to payroll</Link>
    <header className="mt-4 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Employee payroll masterlist</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{run.period_start} – {run.period_end}</h1><p className="mt-1 text-sm text-slate-500">{run.period_start.slice(8, 10) === "01" ? "First cutoff" : run.period_start.slice(8, 10) === "16" ? "Second cutoff" : pretty(run.schedule)} · Pay date {run.pay_date} · Policy {run.policy_name ?? run.rule_version ?? "not recorded"}</p></div>
      <div className="flex flex-wrap items-center gap-3"><PayrollStatusBadge status={run.status} /><Button variant="secondary" asChild><Link href={`/payroll-benefits/payroll/${run.id}/print`} target="_blank">Print payroll and payslips</Link></Button></div>
    </header>
    <section aria-label="Payroll run totals" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Total gross pay", currency(run.total_gross), "text-slate-950"],
        ["Total net take-home", currency(run.total_net), "text-emerald-700"],
        ["Total employee deductions", currency(run.total_deductions), "text-rose-600"],
        ["Employer contributions", currency(run.total_contributions), "text-slate-950"],
      ].map(([label, value, tone]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 text-lg font-semibold tabular-nums ${tone}`}>{value}</p><p className="mt-1 text-[11px] text-slate-400">{items.length} employee{items.length === 1 ? "" : "s"}</p></div>)}
    </section>
    {items.some((item) => item.calculation?.missingAttendanceTreatedAsWeekdayAbsence) && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Some employees had no attendance records. Their weekdays were treated as absences for this calculation, excluding approved paid leave.</p>}
    {run.status === "paid" && items.some((item) => item.workedDays === 0 && item.paidLeaveDays === 0 && item.grossPay > 0) && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This paid-status run contains salary entries with zero worked days and no recorded paid leave. It predates the missing-attendance absence rule and was not recalculated; verify its attendance and payment status before relying on it.</p>}
    <PayrollRunActions runId={run.id} status={run.status} calculatedAt={run.calculated_at} employeeCount={run.employee_count} validationStatus={run.validation_status} roles={roles} />
    <section className="mt-5 overflow-hidden rounded-xl border bg-white">
      <div className="flex gap-6 overflow-x-auto border-b px-4" role="tablist" aria-label="Payroll run data">
        {detailTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => setActive(tab)} className={`relative h-12 shrink-0 text-sm font-medium ${active === tab ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab}{tab === "Employees" && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{items.length}</span>}</button>)}
      </div>
      {active === "Employees" && <>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Employee payroll entries</h2><p className="mt-1 text-xs text-slate-500">Click an employee to view the itemized earnings, deductions, and net-pay calculation.</p></div><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search payroll employees" placeholder="Search employee or department" className="pl-9" /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            {["Employee", "Department", "Days", "Gross pay", "SSS (EE)", "PhilHealth", "Pag-IBIG", "Tax", "Total deductions", "Net pay", "Status"].map((heading, index) => <th key={heading} className={`px-3 py-3 font-medium ${index >= 2 && index <= 9 ? "text-right" : ""} ${index === 8 ? "text-rose-600" : index === 9 ? "text-emerald-700" : ""}`}>{heading}</th>)}
          </tr></thead>
          <tbody>{filteredItems.map((item) => <tr key={item.id} className="border-t hover:bg-slate-50/70">
            <td className="px-3 py-3"><button type="button" aria-label={`View payslip for ${item.employeeName}`} className="flex items-center gap-2.5 text-left" onClick={() => setSelected(item)}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-700">{item.employeeName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><span className="block font-medium text-slate-900 hover:text-indigo-700">{item.employeeName}</span><span className="mt-0.5 block text-xs text-slate-500">{item.employeeNumber}</span></span></button></td>
            <td className="px-3 py-3 text-slate-600">{item.department}</td>
            <td className="px-3 py-3 text-right tabular-nums text-slate-600">{item.workedDays + item.paidLeaveDays}</td>
            <td className="px-3 py-3 text-right font-medium tabular-nums">{currency(item.grossPay)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-rose-600">−{currency(item.sssEmployee)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-rose-600">−{currency(item.philhealthEmployee)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-rose-600">−{currency(item.pagibigEmployee)}</td>
            <td className="px-3 py-3 text-right tabular-nums text-rose-600">−{currency(item.withholdingTax)}</td>
            <td className="px-3 py-3 text-right font-medium tabular-nums text-rose-600">−{currency(item.totalDeductions)}</td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{currency(item.netPay)}</td>
            <td className="px-3 py-3"><span className={item.status === "needs_review" ? "text-amber-700" : "text-emerald-700"}>{pretty(item.status)}</span></td>
          </tr>)}
          {!filteredItems.length && <tr><td colSpan={11} className="px-4 py-12 text-center text-sm text-slate-500">{items.length ? "No employee entries match the search." : "No employee payroll entries are saved on this run."}</td></tr>}
          </tbody>
        </table></div>
      </>}
      {active === "Contributions" && <div className="overflow-x-auto p-4"><div className="mb-3"><h2 className="text-sm font-semibold text-slate-900">Government contributions</h2><p className="mt-1 text-xs text-slate-500">Employee and employer amounts saved by the payroll calculation.</p></div><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Employee", "SSS employee", "SSS employer", "PhilHealth employee", "PhilHealth employer", "Pag-IBIG employee", "Pag-IBIG employer"].map((heading) => <th key={heading} className="px-3 py-3 text-right font-medium first:text-left">{heading}</th>)}</tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="px-3 py-3 font-medium">{item.employeeName}</td>{[item.sssEmployee,item.sssEmployer,item.philhealthEmployee,item.philhealthEmployer,item.pagibigEmployee,item.pagibigEmployer].map((amount,index) => <td key={index} className="px-3 py-3 text-right tabular-nums">{currency(amount)}</td>)}</tr>)}
          {!items.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">No contribution results are available for this run.</td></tr>}
        </tbody>
      </table></div>}
      {active === "Tax" && <div className="overflow-x-auto p-4"><div className="mb-3"><h2 className="text-sm font-semibold text-slate-900">Withholding tax results</h2><p className="mt-1 text-xs text-slate-500">Taxable compensation and withholding amounts recorded for this pay period.</p></div><table className="w-full min-w-[650px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Employee", "Taxable compensation", "Withholding tax"].map((heading) => <th key={heading} className="px-4 py-3 text-right font-medium first:text-left">{heading}</th>)}</tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="px-4 py-3 font-medium">{item.employeeName}</td><td className="px-4 py-3 text-right tabular-nums">{item.taxableCompensation == null ? "Not recorded" : currency(item.taxableCompensation)}</td><td className="px-4 py-3 text-right tabular-nums">{currency(item.withholdingTax)}</td></tr>)}
          {!items.length && <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-500">No tax results are available for this run.</td></tr>}
        </tbody>
      </table></div>}
    </section>
    <PayslipDialog item={selected} report={report} onClose={() => setSelected(null)} />
  </div>;
}
