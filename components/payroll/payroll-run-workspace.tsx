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
    <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
      {item && <>
        <div>
          <DialogTitle>Employee payslip</DialogTitle>
          <DialogDescription>{item.employeeName} · {item.employeeNumber} · {report.run.period_start} – {report.run.period_end}</DialogDescription>
        </div>
        <div className="grid gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-slate-500">Department</p><p className="mt-1 font-medium text-slate-900">{item.department}</p></div>
          <div><p className="text-xs text-slate-500">Pay basis</p><p className="mt-1 font-medium text-slate-900">{pretty(item.salaryFrequency)}</p></div>
          <div><p className="text-xs text-slate-500">Attendance</p><p className="mt-1 font-medium text-slate-900">{item.workedDays} worked · {item.paidLeaveDays} paid leave days</p></div>
        </div>
        <div className="grid gap-6 pt-2 md:grid-cols-2">
          <section>
            <h3 className="border-b pb-2 text-sm font-semibold">Earnings</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Basic salary", item.basicSalary], ["Allowances", item.allowances], ["Overtime", item.overtimePay],
                ["Night differential", item.nightDifferential], ["Bonus", item.bonus], ["Benefits", item.benefits],
                ["Reimbursements", item.reimbursements],
              ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-slate-600">{label}</dt><dd className="tabular-nums">{currency(Number(amount))}</dd></div>)}
              <div className="flex justify-between border-t pt-2 font-semibold"><dt>Gross pay</dt><dd>{currency(item.grossPay)}</dd></div>
            </dl>
          </section>
          <section>
            <h3 className="border-b pb-2 text-sm font-semibold">Deductions</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Late", item.lateDeduction], ["Undertime", item.undertimeDeduction], ["Absence", item.absenceDeduction],
                ["SSS employee share", item.sssEmployee], ["PhilHealth employee share", item.philhealthEmployee],
                ["Pag-IBIG employee share", item.pagibigEmployee], ["Withholding tax", item.withholdingTax],
                ["Benefit deductions", item.benefitDeduction], ["Other deductions", item.otherDeductions],
              ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-slate-600">{label}</dt><dd className="tabular-nums">{currency(Number(amount))}</dd></div>)}
              <div className="flex justify-between border-t pt-2 font-semibold"><dt>Total deductions</dt><dd>{currency(item.totalDeductions)}</dd></div>
            </dl>
          </section>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="text-xs leading-5 text-slate-500">
            <p>Employer contributions: {currency(item.employerContributions)}</p>
            {Number(item.calculation?.hmoEmployerCost) > 0 && <p>HMO employer cost ({item.calculation?.hmoPricingBasis === "provider_quote" ? "provider quote" : "planning estimate"}): {currency(Number(item.calculation?.hmoEmployerCost))}</p>}
            <p>Taxable compensation: {item.taxableCompensation == null ? "Not recorded" : currency(item.taxableCompensation)}</p>
            <p>Policy: {report.run.policy_name ?? report.run.rule_version ?? "Not recorded"}</p>
          </div>
          <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Net pay</p><p className="text-2xl font-semibold tabular-nums text-slate-950">{currency(item.netPay)}</p></div>
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
      <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Payroll run</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{run.period_start} – {run.period_end}</h1><p className="mt-1 text-sm text-slate-500">Pay date {run.pay_date} · {pretty(run.schedule)} · Policy {run.policy_name ?? run.rule_version ?? "not recorded"}</p></div>
      <div className="flex flex-wrap items-center gap-3"><PayrollStatusBadge status={run.status} /><Button variant="secondary" asChild><Link href={`/payroll-benefits/payroll/${run.id}/print`} target="_blank">Print payroll and payslips</Link></Button></div>
    </header>
    <section aria-label="Payroll run totals" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Employees", String(items.length)], ["Gross pay", currency(run.total_gross)], ["Deductions", currency(run.total_deductions)], ["Net pay", currency(run.total_net)]].map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums text-slate-950">{value}</p></div>)}
    </section>
    <PayrollRunActions runId={run.id} status={run.status} calculatedAt={run.calculated_at} employeeCount={run.employee_count} validationStatus={run.validation_status} roles={roles} />
    <section className="mt-5 overflow-hidden rounded-xl border bg-white">
      <div className="flex gap-6 overflow-x-auto border-b px-4" role="tablist" aria-label="Payroll run data">
        {detailTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => setActive(tab)} className={`relative h-12 shrink-0 text-sm font-medium ${active === tab ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab}{tab === "Employees" && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{items.length}</span>}</button>)}
      </div>
      {active === "Employees" && <>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Employee payroll entries</h2><p className="mt-1 text-xs text-slate-500">Select an employee to open their saved payslip details.</p></div><div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search payroll employees" placeholder="Search employee or department" className="pl-9" /></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Employee", "Department", "Basic salary", "Gross pay", "Deductions", "Net pay", "Status"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
          <tbody>{filteredItems.map((item) => <tr key={item.id} className="border-t hover:bg-slate-50/70">
            <td className="px-4 py-3"><button type="button" className="text-left font-medium text-indigo-700 hover:underline" onClick={() => setSelected(item)}>{item.employeeName}</button><p className="text-xs text-slate-500">{item.employeeNumber}</p></td>
            <td className="px-4 py-3 text-slate-600">{item.department}</td>
            <td className="px-4 py-3 tabular-nums">{currency(item.basicSalary)}</td><td className="px-4 py-3 tabular-nums">{currency(item.grossPay)}</td><td className="px-4 py-3 tabular-nums">{currency(item.totalDeductions)}</td><td className="px-4 py-3 font-medium tabular-nums">{currency(item.netPay)}</td><td className="px-4 py-3"><span className={item.status === "needs_review" ? "text-amber-700" : "text-emerald-700"}>{pretty(item.status)}</span></td>
          </tr>)}
          {!filteredItems.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">{items.length ? "No employee entries match the search." : "No employee payroll entries are saved on this run."}</td></tr>}
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
