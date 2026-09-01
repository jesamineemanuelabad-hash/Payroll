"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BadgeCheck, Banknote, BriefcaseBusiness, Check, ChevronDown, CircleDollarSign, Clock3, FileClock, History, MoreHorizontal, Send, TrendingUp, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { compensationRecords as initialRecords } from "@/lib/data/operations-sample";
import { formatCurrency } from "@/lib/utils";
import { CompactMetric, EmployeeCell, OperationsPageHeader, RecordToolbar, TableStatus } from "@/components/shared/operations-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CompensationRecord, ExportRecord } from "@/types/operations";

const exportColumns = [
  { key: "id", label: "Change ID", width: 16 }, { key: "employeeId", label: "Employee ID", width: 16 }, { key: "employee", label: "Employee", width: 24 },
  { key: "department", label: "Department", width: 22 }, { key: "currentSalary", label: "Current Salary", width: 18, format: "currency" as const },
  { key: "proposedSalary", label: "Proposed Salary", width: 18, format: "currency" as const }, { key: "increase", label: "Increase %", width: 14, format: "number" as const },
  { key: "effectiveDate", label: "Effective Date", width: 16, format: "date" as const }, { key: "reason", label: "Reason", width: 28 }, { key: "status", label: "Status", width: 15 },
];
const statusTone = { draft: "slate", submitted: "amber", approved: "indigo", applied: "green", rejected: "red" } as const;

export function CompensationWorkspace() {
  const [records, setRecords] = useState(initialRecords);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<CompensationRecord>(records[0]);
  const [confirmation, setConfirmation] = useState(false);

  const filtered = useMemo(() => records.filter((record) => {
    const query = search.toLowerCase();
    return (!query || `${record.employee} ${record.employeeId} ${record.department} ${record.reason}`.toLowerCase().includes(query)) && (status === "all" || record.status === status);
  }), [records, search, status]);
  const exports: ExportRecord[] = filtered.map((record) => ({ ...record }));
  const approvedValue = records.filter((record) => record.status === "approved" || record.status === "applied").reduce((sum, record) => sum + record.proposedSalary - record.currentSalary, 0);

  function applyApproved() {
    const count = records.filter((record) => record.status === "approved").length;
    setRecords((current) => current.map((record) => record.status === "approved" ? { ...record, status: "applied" as const } : record));
    setConfirmation(true);
    toast.success("Approved changes applied", { description: `${count} salary changes will take effect in the September payroll.` });
  }

  return (
    <div>
      <OperationsPageHeader eyebrow="Compensation Planning" title="Compensation Planning" description="Plan salary adjustments, maintain compensation history, and apply approved changes to upcoming payroll runs." actions={<><Button variant="secondary" onClick={() => toast.info("Compensation history opened in demo mode")}><History />Compensation history</Button><Button onClick={applyApproved}><BadgeCheck />Apply approved changes</Button></>} />
      {confirmation && <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-4" /></span><div><p className="font-medium text-emerald-900">Compensation changes are ready for payroll</p><p className="mt-0.5 text-xs leading-5 text-emerald-700">Approved changes were applied to the September 1–15 payroll draft. The original approvals remain in compensation history.</p></div><button className="ml-auto text-xs font-medium text-emerald-700" onClick={() => setConfirmation(false)}>Dismiss</button></div>}

      <section className="mt-6 grid overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:grid-cols-2 xl:grid-cols-5">
        <CompactMetric label="Cycle budget" value="₱4.80M" helper="FY 2026 merit cycle" icon={Banknote} />
        <CompactMetric label="Allocated" value="₱3.62M" helper="75.4% of total budget" icon={CircleDollarSign} />
        <CompactMetric label="Remaining" value="₱1.18M" helper="Available for allocation" icon={TrendingUp} tone="success" />
        <CompactMetric label="Employees reviewed" value="196 / 248" helper="79% complete" icon={UsersRound} />
        <CompactMetric label="Pending reviews" value="52" helper="12 due this week" icon={Clock3} tone="warning" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex items-center justify-between border-b px-4 py-3.5"><div><h2 className="text-sm font-semibold text-slate-900">Salary changes</h2><p className="mt-0.5 text-xs text-slate-500">{formatCurrency(approvedValue)} in approved annual salary increases</p></div><Button variant="secondary" size="sm" onClick={() => toast.info("New adjustment form opened in demo mode")}><BriefcaseBusiness />New adjustment</Button></div>
          <RecordToolbar search={search} onSearch={setSearch} placeholder="Search employees or reasons…" columns={exportColumns} records={exports} fileName="compensation-changes-2026" sheetName="Compensation Changes"><div className="relative"><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm"><option value="all">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="applied">Applied</option><option value="rejected">Rejected</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div></RecordToolbar>
          <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr>{["Employee", "Current salary", "Proposed salary", "Increase", "Effective date", "Reason", "Status", ""].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map((record) => <tr key={record.id} onClick={() => setSelected(record)} className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70 ${selected.id === record.id ? "bg-indigo-50/40" : ""}`}><td className="h-[68px] px-4"><EmployeeCell name={record.employee} initials={record.initials} secondary={`${record.employeeId} · ${record.department}`} /></td><td className="whitespace-nowrap px-4 tabular-nums text-slate-600">{formatCurrency(record.currentSalary)}</td><td className="whitespace-nowrap px-4 font-medium tabular-nums text-slate-900">{formatCurrency(record.proposedSalary)}</td><td className="px-4"><span className={`font-medium ${record.increase >= 10 ? "text-amber-600" : "text-emerald-600"}`}>+{record.increase.toFixed(2)}%</span></td><td className="whitespace-nowrap px-4 text-slate-600">{format(parseISO(record.effectiveDate), "MMM d, yyyy")}</td><td className="max-w-[200px] truncate px-4 text-slate-600">{record.reason}</td><td className="px-4"><TableStatus label={record.status[0].toUpperCase() + record.status.slice(1)} tone={statusTone[record.status]} /></td><td className="px-4" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setSelected(record)}><FileClock />View salary history</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.success("Recommendation submitted")}><Send />Submit recommendation</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => toast.info("Compensation report prepared")}>Generate report</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}</tbody></table></div>
        </section>

        <aside className="h-fit rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] xl:sticky xl:top-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Selected employee</p><div className="mt-3"><EmployeeCell name={selected.employee} initials={selected.initials} secondary={`${selected.employeeId} · ${selected.department}`} /></div>
          <div className="my-5 h-px bg-slate-100" /><h3 className="text-sm font-semibold text-slate-900">Salary band</h3><div className="mt-4"><div className="relative h-2 rounded-full bg-slate-100"><div className="absolute inset-y-0 left-[22%] right-[18%] rounded-full bg-indigo-200" /><span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-indigo-600 shadow" style={{ left: `${Math.min(92, Math.max(8, ((selected.proposedSalary - 70000) / 90000) * 100))}%` }} /></div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>₱70K min</span><span>₱115K mid</span><span>₱160K max</span></div></div>
          <dl className="mt-5 space-y-3 text-xs"><div className="flex justify-between"><dt className="text-slate-500">Current</dt><dd className="font-medium text-slate-700">{formatCurrency(selected.currentSalary)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Proposed</dt><dd className="font-medium text-indigo-700">{formatCurrency(selected.proposedSalary)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Effective</dt><dd className="font-medium text-slate-700">{format(parseISO(selected.effectiveDate), "MMM d, yyyy")}</dd></div></dl>
          <div className="mt-5 rounded-lg bg-slate-50 p-3"><p className="text-xs font-medium text-slate-700">Change rationale</p><p className="mt-1 text-xs leading-5 text-slate-500">{selected.reason}. Manager justification and approval records are retained in the audit history.</p></div>
        </aside>
      </div>
    </div>
  );
}
