"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BadgeCheck, Check, ChevronDown, CircleAlert, Clock3, FileCheck2, FileText, History, MoreHorizontal, ReceiptText, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { claimRecords as initialRecords } from "@/lib/data/operations-sample";
import { formatCurrency } from "@/lib/utils";
import { CompactMetric, EmployeeCell, OperationsPageHeader, RecordToolbar, SyncButton, TableStatus } from "@/components/shared/operations-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ClaimRecord, ExportRecord } from "@/types/operations";

const exportColumns = [
  { key: "id", label: "Claim ID", width: 17 }, { key: "employee", label: "Employee", width: 24 }, { key: "category", label: "Category", width: 18 },
  { key: "description", label: "Description", width: 32 }, { key: "amount", label: "Amount", width: 16, format: "currency" as const },
  { key: "submittedDate", label: "Submitted Date", width: 17, format: "date" as const }, { key: "documents", label: "Documents", width: 13, format: "number" as const },
  { key: "verification", label: "Verification", width: 18 }, { key: "status", label: "Reimbursement Status", width: 22 },
];

const statusLabel = { approved_ess: "Approved in ESS", verifying: "Verifying", ready_for_payroll: "Ready for payroll", included: "Included in payroll", rejected: "Rejected" };
const statusTone = { approved_ess: "blue", verifying: "amber", ready_for_payroll: "indigo", included: "green", rejected: "red" } as const;

export function ClaimsWorkspace() {
  const [records, setRecords] = useState(initialRecords);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<ClaimRecord | null>(initialRecords[0]);
  const filtered = useMemo(() => records.filter((record) => (!search || `${record.id} ${record.employee} ${record.category} ${record.description}`.toLowerCase().includes(search.toLowerCase())) && (status === "all" || record.status === status)), [records, search, status]);
  const exports: ExportRecord[] = filtered.map((record) => ({ ...record }));
  const readyTotal = records.filter((record) => record.status === "ready_for_payroll").reduce((sum, record) => sum + record.amount, 0);

  function includeReady() {
    const count = records.filter((record) => record.status === "ready_for_payroll").length;
    setRecords((current) => current.map((record) => record.status === "ready_for_payroll" ? { ...record, status: "included" as const } : record));
    if (selected?.status === "ready_for_payroll") setSelected({ ...selected, status: "included" });
    toast.success("Reimbursements added to payroll", { description: `${count} verified claims totaling ${formatCurrency(readyTotal)} were included.` });
  }

  function verifyClaim(record: ClaimRecord) {
    if (record.documents === 0) { toast.error("Supporting document required", { description: "Request a receipt before verifying this claim." }); return; }
    const updated: ClaimRecord = { ...record, verification: "verified", status: "ready_for_payroll" };
    setRecords((current) => current.map((item) => item.id === record.id ? updated : item)); setSelected(updated); toast.success("Claim verified", { description: `${record.id} is ready to include in payroll.` });
  }

  return (
    <div>
      <OperationsPageHeader eyebrow="Claims & Reimbursement" title="Claims & Reimbursement" description="Retrieve approved ESS claims, verify supporting documents, process reimbursements, and include eligible amounts in payroll." actions={<><SyncButton label="Retrieve approved claims" /><Button onClick={includeReady}><WalletCards />Include in payroll</Button></>} />
      <section className="mt-6 grid overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:grid-cols-2 xl:grid-cols-5"><CompactMetric label="Approved from ESS" value="8" helper="Retrieved in latest sync" icon={ReceiptText} /><CompactMetric label="Awaiting verification" value="4" helper="1 missing document" icon={FileCheck2} tone="warning" /><CompactMetric label="Ready for payroll" value={formatCurrency(readyTotal)} helper="Verified reimbursements" icon={BadgeCheck} tone="success" /><CompactMetric label="Included this month" value="₱186,420.00" helper="31 reimbursements" icon={WalletCards} /><CompactMetric label="Average processing" value="1.8 days" helper="0.4 days faster" icon={Clock3} /></section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex items-center justify-between border-b px-4 py-3.5"><div><h2 className="text-sm font-semibold text-slate-900">Reimbursement queue</h2><p className="mt-0.5 text-xs text-slate-500">Approved ESS claims awaiting payroll completion</p></div><Button variant="secondary" size="sm" onClick={() => toast.info("Claim history opened in demo mode")}><History />Claim history</Button></div>
          <RecordToolbar search={search} onSearch={setSearch} placeholder="Search claims or employees…" columns={exportColumns} records={exports} fileName="claims-reimbursements-2026-08" sheetName="Claims"><div className="relative"><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm"><option value="all">All statuses</option><option value="approved_ess">Approved in ESS</option><option value="verifying">Verifying</option><option value="ready_for_payroll">Ready for payroll</option><option value="included">Included</option><option value="rejected">Rejected</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div></RecordToolbar>
          <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-sm"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr>{["Claim & employee", "Category", "Description", "Submitted", "Amount", "Documents", "Verification", "Status", ""].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map((record) => <tr key={record.id} onClick={() => setSelected(record)} className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/70 ${selected?.id === record.id ? "bg-indigo-50/40" : ""}`}><td className="h-[68px] px-4"><EmployeeCell name={record.employee} initials={record.initials} secondary={record.id} /></td><td className="px-4"><TableStatus label={record.category} tone="slate" /></td><td className="max-w-[200px] truncate px-4 text-slate-600">{record.description}</td><td className="whitespace-nowrap px-4 text-slate-600">{format(parseISO(record.submittedDate), "MMM d, yyyy")}</td><td className="whitespace-nowrap px-4 font-medium tabular-nums text-slate-900">{formatCurrency(record.amount)}</td><td className="px-4"><span className={`flex items-center gap-1.5 text-xs font-medium ${record.documents ? "text-slate-600" : "text-red-600"}`}>{record.documents ? <FileText className="size-3.5" /> : <CircleAlert className="size-3.5" />}{record.documents || "Missing"}</span></td><td className="px-4"><TableStatus label={record.verification === "verified" ? "Verified" : record.verification === "needs_review" ? "Needs review" : "Missing document"} tone={record.verification === "verified" ? "green" : record.verification === "needs_review" ? "amber" : "red"} /></td><td className="px-4"><TableStatus label={statusLabel[record.status]} tone={statusTone[record.status]} /></td><td className="px-4" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setSelected(record)}><FileText />View claim</DropdownMenuItem><DropdownMenuItem onSelect={() => verifyClaim(record)}><BadgeCheck />Verify claim</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.info("Document request sent to employee")}><CircleAlert />Request document</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onSelect={() => toast.error("Rejection requires a reason in the full workflow")}><X />Reject claim</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}</tbody></table></div>
        </section>

        {selected && <aside className="h-fit rounded-xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] xl:sticky xl:top-24"><div className="flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Verification details</p><h3 className="mt-1 text-base font-semibold text-slate-900">{selected.id}</h3></div><TableStatus label={statusLabel[selected.status]} tone={statusTone[selected.status]} /></div><div className="mt-4 rounded-lg border bg-slate-50 p-3"><p className="text-sm font-medium text-slate-800">{selected.description}</p><p className="mt-1 text-xs text-slate-500">{selected.category} · {selected.employee}</p><p className="mt-3 text-lg font-semibold text-slate-950">{formatCurrency(selected.amount)}</p></div><h4 className="mt-5 text-xs font-semibold text-slate-700">Verification checklist</h4><div className="mt-3 space-y-3">{[{ label: "ESS approval confirmed", done: true }, { label: "Employee identity matched", done: true }, { label: "Supporting documents", done: selected.documents > 0 }, { label: "Amount and policy limits", done: selected.verification === "verified" }].map((item) => <div className="flex items-center gap-2.5" key={item.label}><span className={`grid size-5 place-items-center rounded-full ${item.done ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{item.done ? <Check className="size-3" /> : <CircleAlert className="size-3" />}</span><span className="text-xs text-slate-600">{item.label}</span></div>)}</div><div className="my-5 h-px bg-slate-100" /><Button className="w-full" onClick={() => verifyClaim(selected)} disabled={selected.verification === "verified"}><BadgeCheck />{selected.verification === "verified" ? "Verification complete" : "Mark as verified"}</Button></aside>}
      </div>
    </div>
  );
}
