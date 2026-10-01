"use client";

import { useState, useTransition } from "react";
import { getPayrollRunReport, getPayrollThirteenthMonthSnapshot } from "@/app/actions/payroll";
import type { PayrollPolicyRow } from "@/app/actions/payroll-policy";
import { PayrollManagement } from "@/components/payroll/payroll-management";
import { PayrollPolicyManager } from "@/components/payroll/payroll-policy-manager";
import { formatCurrency } from "@/lib/utils";
import type { PayrollDashboardData, PayrollRunReport, PayrollThirteenthMonthSnapshot } from "@/types/payroll";

type WorkspaceTab = "Payroll runs" | "Contributions & tax" | "13th month" | "Policy";
type ContributionTab = "SSS" | "PhilHealth" | "Pag-IBIG" | "Tax";
const tabs: WorkspaceTab[] = ["Payroll runs", "Contributions & tax", "13th month", "Policy"];
const contributionTabs: ContributionTab[] = ["SSS", "PhilHealth", "Pag-IBIG", "Tax"];
const currency = (value: number) => formatCurrency(value);

function EmptyData({ children }: { children: string }) {
  return <div className="rounded-xl border border-dashed bg-white px-6 py-12 text-center text-sm text-slate-500">{children}</div>;
}

function PayrollCalculationTables({ runs, initialReport, initialError }: { runs: PayrollDashboardData["runs"]; initialReport: PayrollRunReport | null; initialError: string | null }) {
  const [runId, setRunId] = useState(initialReport?.run.id ?? "");
  const [report, setReport] = useState(initialReport);
  const [error, setError] = useState(initialError ?? "");
  const [active, setActive] = useState<ContributionTab>("SSS");
  const [busy, startTransition] = useTransition();

  function selectRun(value: string) {
    setRunId(value);
    setError("");
    if (!value) {
      setReport(null);
      return;
    }
    startTransition(async () => {
      const result = await getPayrollRunReport(value);
      if (!result.ok) {
        setReport(null);
        setError(result.message);
        return;
      }
      setReport(result.data);
    });
  }

  const columns: Array<[string, (item: PayrollRunReport["items"][number]) => number | string]> = active === "SSS"
    ? [["SSS employee share", (item: PayrollRunReport["items"][number]) => item.sssEmployee], ["SSS employer share", (item: PayrollRunReport["items"][number]) => item.sssEmployer]]
    : active === "PhilHealth"
      ? [["PhilHealth employee share", (item: PayrollRunReport["items"][number]) => item.philhealthEmployee], ["PhilHealth employer share", (item: PayrollRunReport["items"][number]) => item.philhealthEmployer]]
      : active === "Pag-IBIG"
        ? [["Pag-IBIG employee share", (item: PayrollRunReport["items"][number]) => item.pagibigEmployee], ["Pag-IBIG employer share", (item: PayrollRunReport["items"][number]) => item.pagibigEmployer]]
        : [["Taxable compensation", (item: PayrollRunReport["items"][number]) => item.taxableCompensation ?? "Not recorded"], ["Withholding tax", (item: PayrollRunReport["items"][number]) => item.withholdingTax]];

  return <section className="rounded-xl border bg-white">
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-sm font-semibold text-slate-900">Payroll calculation results</h2><p className="mt-1 text-xs text-slate-500">Actual employee results saved on a calculated payroll run.</p></div>
      <label className="text-xs font-medium text-slate-600">Payroll period
        <select value={runId} onChange={(event) => selectRun(event.target.value)} className="mt-1 block h-9 min-w-64 rounded-lg border bg-white px-3 text-sm font-normal" aria-label="Select payroll period" disabled={busy}>
          <option value="">Select a payroll period</option>
          {runs.map((run) => <option value={run.id} key={run.id}>{run.periodStart} – {run.periodEnd} · {run.status.replaceAll("_", " ")}</option>)}
        </select>
      </label>
    </div>
    <div className="flex gap-5 overflow-x-auto border-b px-4" role="tablist" aria-label="Payroll calculation categories">
      {contributionTabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => setActive(tab)} className={`relative h-11 shrink-0 text-sm font-medium ${active === tab ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab}</button>)}
    </div>
    <div className="p-4">
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!report && !error && <EmptyData>{busy ? "Loading saved payroll results…" : "Select a payroll period to view its calculation results."}</EmptyData>}
      {report && <div className="overflow-x-auto">
        <div className="mb-3 text-xs text-slate-500">Period {report.run.period_start} – {report.run.period_end} · Policy {report.run.policy_name ?? report.run.rule_version ?? "not recorded"}</div>
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3 font-medium">Employee</th><th className="px-3 py-3 font-medium">Department</th>{columns.map(([label]) => <th key={label as string} className="px-3 py-3 text-right font-medium">{label as string}</th>)}</tr></thead>
          <tbody>{report.items.map((item) => <tr key={item.id} className="border-t">
            <td className="px-3 py-3"><p className="font-medium text-slate-900">{item.employeeName}</p><p className="text-xs text-slate-500">{item.employeeNumber}</p></td>
            <td className="px-3 py-3 text-slate-600">{item.department}</td>
            {columns.map(([label, getValue]) => { const value = getValue(item); return <td key={label} className="px-3 py-3 text-right tabular-nums text-slate-800">{typeof value === "number" ? currency(value) : value}</td>; })}
          </tr>)}
          {!report.items.length && <tr><td colSpan={2 + columns.length} className="px-3 py-10 text-center text-sm text-slate-500">No employee payroll entries are saved for this run.</td></tr>}
          </tbody>
        </table>
      </div>}
    </div>
  </section>;
}

function ThirteenthMonthTable({ initialSnapshot }: { initialSnapshot: PayrollThirteenthMonthSnapshot | null }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [year, setYear] = useState(initialSnapshot?.year ?? new Date().getFullYear());
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();

  function selectYear(value: number) {
    setYear(value);
    setError("");
    startTransition(async () => {
      const result = await getPayrollThirteenthMonthSnapshot(value);
      if (!result.ok) {
        setSnapshot(null);
        setError(result.message);
        return;
      }
      setSnapshot(result.data);
    });
  }

  return <section className="overflow-hidden rounded-xl border bg-white">
    <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h2 className="text-sm font-semibold text-slate-900">13th-month calculation</h2><p className="mt-1 text-xs text-slate-500">Calculated from paid payroll entries only; unpaid or future payroll is not projected.</p></div>
      <label className="text-xs font-medium text-slate-600">Calendar year
        <select value={year} onChange={(event) => selectYear(Number(event.target.value))} className="mt-1 block h-9 rounded-lg border bg-white px-3 text-sm font-normal" disabled={busy}>
          {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index).map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>
    </div>
    <div className="p-4">
      <p className="mb-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">{snapshot?.basis ?? "The calculation uses basic salary from paid payroll entries for the selected calendar year, divided by 12."}</p>
      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!snapshot && !error && <EmptyData>{busy ? "Loading paid payroll entries…" : "No 13th-month data is available."}</EmptyData>}
      {snapshot && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-3 font-medium">Employee</th><th className="px-3 py-3 font-medium">Department</th><th className="px-3 py-3 text-right font-medium">Paid basic salary (YTD)</th><th className="px-3 py-3 text-right font-medium">Paid payroll entries</th><th className="px-3 py-3 text-right font-medium">13th-month amount</th></tr></thead>
        <tbody>{snapshot.items.map((item) => <tr key={item.employeeId} className="border-t">
          <td className="px-3 py-3"><p className="font-medium text-slate-900">{item.employeeName}</p><p className="text-xs text-slate-500">{item.employeeNumber}</p></td>
          <td className="px-3 py-3 text-slate-600">{item.department}</td>
          <td className="px-3 py-3 text-right tabular-nums">{currency(item.paidBasicSalary)}</td>
          <td className="px-3 py-3 text-right tabular-nums">{item.paidPayrollEntries}</td>
          <td className="px-3 py-3 text-right font-medium tabular-nums">{currency(item.amount)}</td>
        </tr>)}
        {!snapshot.items.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">No paid payroll entries were found for {snapshot.year}.</td></tr>}
        </tbody>
      </table></div>}
    </div>
  </section>;
}

export function PayrollWorkspace({
  dashboard,
  roles,
  initialReport,
  reportError,
  policies,
  policyError,
  thirteenthMonth,
  thirteenthMonthError,
}: {
  dashboard: PayrollDashboardData;
  roles: string[];
  initialReport: PayrollRunReport | null;
  reportError: string | null;
  policies: PayrollPolicyRow[];
  policyError: string | null;
  thirteenthMonth: PayrollThirteenthMonthSnapshot | null;
  thirteenthMonthError: string | null;
}) {
  const [active, setActive] = useState<WorkspaceTab>("Payroll runs");

  return <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
    <div className="mb-4"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">Payroll</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Review payroll runs, employee pay, statutory deductions, and approval status.</p></div>
    <div className="flex gap-6 overflow-x-auto border-b" role="tablist" aria-label="Payroll sections">
      {tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={active === tab} onClick={() => setActive(tab)} className={`relative h-12 shrink-0 text-sm font-medium ${active === tab ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab}</button>)}
    </div>
    <div className="pt-5">
      {active === "Payroll runs" && <PayrollManagement data={dashboard} />}
      {active === "Contributions & tax" && (reportError && !initialReport && !dashboard.runs.length
        ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{reportError}</p>
        : <PayrollCalculationTables runs={dashboard.runs} initialReport={initialReport} initialError={reportError} />)}
      {active === "13th month" && (thirteenthMonthError && !thirteenthMonth
        ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{thirteenthMonthError}</p>
        : <ThirteenthMonthTable initialSnapshot={thirteenthMonth} />)}
      {active === "Policy" && (policyError
        ? <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{policyError}</p>
        : <PayrollPolicyManager policies={policies} canEdit={roles.includes("super_admin")} />)}
    </div>
    {!roles.length && <p className="mt-5 text-xs text-slate-500">Payroll data is restricted by role and the current session has no payroll role assignment.</p>}
    {!dashboard.runs.length && active === "Payroll runs" && <p className="mt-3 text-xs text-slate-500">No payroll run data is available yet. New runs require configured payroll policies and employee compensation records.</p>}
  </div>;
}
