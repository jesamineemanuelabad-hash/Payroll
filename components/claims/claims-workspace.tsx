"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Eye, FileText, Search, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { readRecords, resolveRecordLabels, saveRecord, uploadClaimReceipt } from "@/app/actions/records";
import { OperationsPageHeader, TableStatus } from "@/components/shared/operations-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RecordRow } from "@/lib/records/config";
import { formatCurrency } from "@/lib/utils";

const claimCategories = [
  { value: "medical", label: "Medical", description: "Health, dental, optical, and pharmaceutical expenses" },
  { value: "transportation", label: "Transportation", description: "Commute, fuel, parking, and ride-hailing costs" },
  { value: "meals", label: "Meals & Dining", description: "Business meals, client meals, and per diem" },
  { value: "travel", label: "Travel", description: "Hotel stays, airfare, and business travel" },
  { value: "communication", label: "Communication", description: "Phone, internet, and data expenses" },
  { value: "office_expense", label: "Office expense", description: "Stationery, equipment, and office supplies" },
  { value: "other", label: "Other", description: "Other eligible business expenses" },
] as const;

const statuses = ["all", "pending", "under_review", "finance_approval", "approved", "rejected", "paid"] as const;
type ClaimStatus = Exclude<(typeof statuses)[number], "all">;
type Tab = "queue" | "categories";
type NewClaim = { employeeId: string; category: string; expenseDate: string; description: string; amount: string; receiptFile: File | null };

const emptyClaim = (): NewClaim => ({
  employeeId: "",
  category: "transportation",
  expenseDate: new Date().toISOString().slice(0, 10),
  description: "",
  amount: "",
  receiptFile: null,
});
const valueString = (row: RecordRow, key: string) => String(row[key] ?? "");
const pretty = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const categoryLabel = (value: string) => claimCategories.find((item) => item.value === value)?.label ?? pretty(value);
const claimStatusLabel = (value: string) => value === "finance_approval" ? "For Finance Review" : value === "approved" ? "Pending disbursement" : value === "paid" ? "Payment recorded" : pretty(value);

const statusTone: Record<ClaimStatus, "amber" | "blue" | "indigo" | "green" | "red" | "slate"> = {
  pending: "amber",
  under_review: "blue",
  finance_approval: "indigo",
  approved: "amber",
  rejected: "red",
  paid: "slate",
};

function amountValue(row: RecordRow, key: string) {
  return Number(row[key] ?? 0);
}

export function ClaimsWorkspace({ configured, roles }: { configured: boolean; roles: string[] }) {
  const [tab, setTab] = useState<Tab>("queue");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [employees, setEmployees] = useState<RecordRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof statuses)[number]>("all");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [newClaim, setNewClaim] = useState<NewClaim>(emptyClaim());
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [financeHandoff, setFinanceHandoff] = useState<RecordRow | null>(null);
  const [rejection, setRejection] = useState<RecordRow | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, startTransition] = useTransition();
  const canManage = roles.some((role) => ["super_admin", "hr_admin", "hr_manager", "payroll_manager"].includes(role));
  const pageSize = 10;

  const refresh = useCallback(async () => {
    if (!configured) {
      setRows([]);
      setEmployees([]);
      setLoading(false);
      setError("Connect Supabase and apply the payroll and claims migrations to load reimbursement records.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      async function readAll(entity: "claims" | "profiles") {
        const all: RecordRow[] = [];
        let count = 1;
        for (let current = 0; all.length < count; current += 1) {
          const result = await readRecords({ entity, size: 1000, page: current });
          if (!result.ok) throw new Error(result.message);
          count = result.data.count;
          all.push(...result.data.rows);
          if (!result.data.rows.length) break;
        }
        return all;
      }
      const [claimRows, employeeRows] = await Promise.all([readAll("claims"), readAll("profiles")]);
      const ids = [...new Set(claimRows.map((row) => valueString(row, "employee_id")).filter(Boolean))];
      const groups = await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) =>
        resolveRecordLabels([{ entity: "profiles", ids: ids.slice(index * 100, index * 100 + 100) }]),
      ));
      setRows(claimRows);
      setEmployees(employeeRows);
      setLabels(Object.assign({}, ...groups));
    } catch (cause) {
      setRows([]);
      setEmployees([]);
      setError(cause instanceof Error ? cause.message : "Unable to load claims. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const onSynced = () => void refresh();
    window.addEventListener("hr2-sync-complete", onSynced);
    return () => { window.clearTimeout(timer); window.removeEventListener("hr2-sync-complete", onSynced); };
  }, [refresh]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = valueString(row, "status") as ClaimStatus;
      const text = `${valueString(row, "claim_number")} ${labels[valueString(row, "employee_id")] ?? ""} ${valueString(row, "category")} ${valueString(row, "description")}`.toLowerCase();
      return (statusFilter === "all" || statusFilter === status) && (!query || text.includes(query));
    }).sort((left, right) => valueString(right, "expense_date").localeCompare(valueString(left, "expense_date")));
  }, [labels, rows, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const counts = useMemo(() => ({
    pending: rows.filter((row) => valueString(row, "status") === "pending").length,
    inReview: rows.filter((row) => ["under_review", "finance_approval"].includes(valueString(row, "status"))).length,
    approved: rows.filter((row) => valueString(row, "status") === "approved").length,
  }), [rows]);
  const employeeName = (row: RecordRow) => labels[valueString(row, "employee_id")] ?? "Employee record";

  function saveNewClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(newClaim.amount);
    const receiptFile = newClaim.receiptFile;
    if (!newClaim.employeeId || !newClaim.description.trim() || !(amount > 0) || !receiptFile) {
      toast.error("Complete the required claim details.");
      return;
    }
    startTransition(async () => {
      const receiptData = new FormData();
      receiptData.set("employeeId", newClaim.employeeId);
      receiptData.set("file", receiptFile);
      const uploaded = await uploadClaimReceipt(receiptData);
      if (!uploaded.ok) {
        toast.error("Supporting document upload failed", { description: uploaded.message });
        return;
      }
      const year = newClaim.expenseDate.slice(0, 4);
      const claimNumber = `CLM-${year}-${Date.now().toString(36).toUpperCase()}`;
      const created = await saveRecord({
        entity: "claims",
        values: {
          employee_id: newClaim.employeeId,
          claim_number: claimNumber,
          category: newClaim.category,
          expense_date: newClaim.expenseDate,
          description: newClaim.description.trim(),
          requested_amount: amount,
          approved_amount: 0,
          receipt_url: uploaded.data.url,
          verification_status: "pending",
          status: "draft",
          rejection_reason: null,
        },
      });
      if (!created.ok) {
        toast.error("Claim could not be saved", { description: created.message });
        return;
      }
      const submitted = await updateClaim(created.data, { status: "pending" });
      if (!submitted.ok) {
        toast.error("Claim saved as draft but could not be submitted", { description: submitted.message });
        await refresh();
        return;
      }
      toast.success("Claim submitted for review");
      setCreateOpen(false);
      setNewClaim(emptyClaim());
      await refresh();
    });
  }

  function updateClaim(row: RecordRow, changes: Partial<{
    status: ClaimStatus;
    verification_status: string;
    approved_amount: number;
    rejection_reason: string | null;
  }>) {
    return saveRecord({
      entity: "claims",
      id: row.id,
      version: valueString(row, "updated_at"),
      values: {
        employee_id: valueString(row, "employee_id"),
        claim_number: valueString(row, "claim_number"),
        category: valueString(row, "category"),
        expense_date: valueString(row, "expense_date"),
        description: valueString(row, "description"),
        requested_amount: amountValue(row, "requested_amount"),
        approved_amount: amountValue(row, "approved_amount"),
        receipt_url: valueString(row, "receipt_url") || null,
        verification_status: valueString(row, "verification_status"),
        status: valueString(row, "status"),
        rejection_reason: valueString(row, "rejection_reason") || null,
        ...changes,
      },
    });
  }

  function advance(row: RecordRow) {
    const status = valueString(row, "status");
    const hasReceipt = valueString(row, "receipt_url").startsWith("https://");
    const verified = valueString(row, "verification_status") === "verified";
    let changes: Parameters<typeof updateClaim>[1] | null = null;
    if (status === "pending" && hasReceipt) changes = { status: "under_review", verification_status: "verified" };
    else if (status === "under_review" && verified) changes = { status: "finance_approval" };
    if (!changes) {
      toast.error("Open the claim and verify its supporting document before moving it forward.");
      return;
    }
    startTransition(async () => {
      const result = await updateClaim(row, changes);
      if (!result.ok) {
        toast.error("Claim workflow update failed", { description: result.message });
        return;
      }
      toast.success(`Claim moved to ${pretty(valueString(result.data, "status"))}`);
      setSelected(null);
      await refresh();
    });
  }

  function sendToFinance() {
    if (!financeHandoff) return;
    const claim = financeHandoff;
    startTransition(async () => {
      const result = await updateClaim(claim, { status: "finance_approval" });
      if (!result.ok) {
        toast.error("Claim was not sent to Finance", { description: result.message });
        return;
      }
      toast.success("Claim sent for Finance review", { description: "Reimbursement is not included in payroll until Finance approval is recorded." });
      setFinanceHandoff(null);
      setSelected(null);
      await refresh();
    });
  }

  function rejectClaim() {
    if (!rejection || !rejectionReason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    startTransition(async () => {
      const result = await updateClaim(rejection, { status: "rejected", rejection_reason: rejectionReason.trim() });
      if (!result.ok) {
        toast.error("Claim rejection failed", { description: result.message });
        return;
      }
      toast.success("Claim rejected");
      setRejection(null);
      setRejectionReason("");
      await refresh();
    });
  }

  return <div className="space-y-6">
    <OperationsPageHeader eyebrow="Claims & Reimbursement" title="Claims & Reimbursement" description="Review employee expense claims, verify receipts, and hand eligible claims off for Finance approval." />
    <nav aria-label="Claims workspace modules" className="flex gap-2 overflow-x-auto border-b pb-3">
      {([{ id: "queue", label: "Reimbursement Queue" }, { id: "categories", label: "Claim Categories" }] as const).map((item) =>
        <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${tab === item.id ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>{item.label}</button>,
      )}
    </nav>
    {tab === "queue" && <section className="space-y-5">
      <section aria-label="Claims summary" className="grid gap-3 sm:grid-cols-3">
        {[["Pending claims", counts.pending, "Awaiting document review"], ["In review", counts.inReview, "HR or Finance review"], ["Pending disbursement", counts.approved, "Approved reimbursements awaiting Finance payment"]].map(([label, count, detail]) =>
          <article key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{count}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>,
        )}
      </section>
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-semibold text-slate-900">Reimbursement queue</h2><p className="mt-1 text-xs text-slate-500">Claims enter draft payroll only after Finance approval is recorded. This system does not disburse reimbursements.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search claim, employee, or description…" aria-label="Search claims" className="pl-9 sm:w-72" /></div>
            <div className="relative"><select aria-label="Filter claim status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as (typeof statuses)[number]); setPage(0); }} className="h-9 w-full appearance-none rounded-lg border bg-white pl-3 pr-8 text-sm sm:w-44">{statuses.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : claimStatusLabel(status)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div>
            {canManage && <Button onClick={() => { setNewClaim(emptyClaim()); setCreateOpen(true); }}>Add claim</Button>}
          </div>
        </div>
        {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!canManage && <p role="status" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Claims are available to HR and Finance reviewers.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Claim number", "Employee", "Expense", "Requested", "Approved", "Status", "Receipt", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
          <tbody>{pageRows.map((row) => {
            const status = valueString(row, "status") as ClaimStatus;
            const receiptUrl = valueString(row, "receipt_url");
            return <tr key={row.id} className="border-t hover:bg-slate-50/70">
              <td className="px-4 py-3 font-medium text-indigo-700">{valueString(row, "claim_number")}</td>
              <td className="px-4 py-3 text-slate-800">{employeeName(row)}</td>
              <td className="px-4 py-3"><p>{categoryLabel(valueString(row, "category"))}</p><p className="mt-0.5 text-xs text-slate-500">{valueString(row, "expense_date")}</p></td>
              <td className="px-4 py-3 tabular-nums">{formatCurrency(amountValue(row, "requested_amount"))}</td>
              <td className="px-4 py-3 tabular-nums">{amountValue(row, "approved_amount") ? formatCurrency(amountValue(row, "approved_amount")) : "—"}</td>
              <td className="px-4 py-3"><TableStatus label={claimStatusLabel(status)} tone={statusTone[status]} /></td>
              <td className="px-4 py-3">{receiptUrl ? <a href={receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:underline"><FileText className="size-3.5" />View receipt</a> : <span className="inline-flex items-center gap-1 text-xs text-amber-700"><CircleAlert className="size-3.5" />Missing</span>}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label={`View ${valueString(row, "claim_number")}`} onClick={() => setSelected(row)}><Eye /></Button>
                {canManage && ["pending", "under_review"].includes(status) && <Button type="button" variant="secondary" size="sm" disabled={busy || (status === "under_review" && valueString(row, "verification_status") !== "verified")} onClick={() => status === "pending" ? setSelected(row) : setFinanceHandoff(row)}>{status === "pending" ? "Review" : "Send to Finance"}</Button>}
                {canManage && ["pending", "under_review"].includes(status) && <Button type="button" variant="ghost" size="icon" aria-label={`Reject ${valueString(row, "claim_number")}`} className="text-red-600" onClick={() => { setRejection(row); setRejectionReason(""); }}><X /></Button>}
              </div></td>
            </tr>;
          })}
          {!pageRows.length && <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-slate-500">{loading ? "Loading reimbursement claims…" : error ? "Claims could not be loaded." : rows.length ? "No claims match these filters." : "No reimbursement claims have been recorded."}</td></tr>}</tbody>
        </table></div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{filtered.length} claims · Page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={!page} onClick={() => setPage((current) => current - 1)}><ChevronLeft />Previous</Button><Button variant="secondary" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next<ChevronRight /></Button></div></div>
      </section>
    </section>}
    {tab === "categories" && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {claimCategories.map((category) => {
        const categoryRows = rows.filter((row) => valueString(row, "category") === category.value);
        const approved = categoryRows.filter((row) => ["approved", "paid"].includes(valueString(row, "status")));
        const totalApproved = approved.reduce((sum, row) => sum + amountValue(row, "approved_amount"), 0);
        return         <article key={category.value} className="rounded-xl border bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">{category.label}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{category.description}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{categoryRows.length} claims</span></div><div className="mt-4 flex justify-between border-t pt-3 text-xs"><span className="text-slate-500">Pending disbursement / paid</span><span className="font-medium text-slate-800">{approved.length}</span></div><div className="mt-2 flex justify-between text-xs"><span className="text-slate-500">Approved amount</span><span className="font-medium tabular-nums text-slate-800">{formatCurrency(totalApproved)}</span></div></article>;
      })}
    </section>}

    <Dialog open={createOpen} onOpenChange={(open) => { if (!busy) setCreateOpen(open); }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Submit employee claim</DialogTitle>
        <DialogDescription>Enter the expense details and attach the supporting receipt before review.</DialogDescription>
        <form onSubmit={saveNewClaim} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Employee<select required value={newClaim.employeeId} onChange={(event) => setNewClaim((value) => ({ ...value, employeeId: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">Select employee</option>{employees.map((employee) => <option key={valueString(employee, "id")} value={valueString(employee, "id")}>{valueString(employee, "employee_number")} · {valueString(employee, "first_name")} {valueString(employee, "last_name")}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Claim type<select value={newClaim.category} onChange={(event) => setNewClaim((value) => ({ ...value, category: event.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">{claimCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Expense date<Input required type="date" value={newClaim.expenseDate} onChange={(event) => setNewClaim((value) => ({ ...value, expenseDate: event.target.value }))} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-slate-700">Requested amount (PHP)<Input required type="number" min="0.01" step="0.01" value={newClaim.amount} onChange={(event) => setNewClaim((value) => ({ ...value, amount: event.target.value }))} className="mt-1.5" /></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Receipt / supporting document<Input required type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setNewClaim((value) => ({ ...value, receiptFile: event.target.files?.[0] ?? null }))} className="mt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-indigo-700" /><span className="mt-1 block text-xs font-normal text-slate-500">Upload a PDF, JPEG, or PNG (up to 5 MB). Receipt files are stored privately.</span></label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description / business purpose<textarea required maxLength={4000} rows={3} value={newClaim.description} onChange={(event) => setNewClaim((value) => ({ ...value, description: event.target.value }))} className="mt-1.5 w-full rounded-lg border p-3 text-sm font-normal" /></label>
          <div className="flex justify-end gap-2 border-t pt-4 sm:col-span-2"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !newClaim.employeeId}>{busy ? "Submitting…" : "Save & submit"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-w-2xl">
        {selected && <>
          <DialogTitle>Claim details · {valueString(selected, "claim_number")}</DialogTitle>
          <DialogDescription>{employeeName(selected)} · {categoryLabel(valueString(selected, "category"))} · {valueString(selected, "expense_date")}</DialogDescription>
          <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            {[["Requested amount", formatCurrency(amountValue(selected, "requested_amount"))], ["Approved amount", amountValue(selected, "approved_amount") ? formatCurrency(amountValue(selected, "approved_amount")) : "—"], ["Status", claimStatusLabel(valueString(selected, "status"))], ["Document review", pretty(valueString(selected, "verification_status"))], ["HR reviewer", labels[valueString(selected, "reviewer_id")] ?? "—"], ["Finance approver", labels[valueString(selected, "finance_approver_id")] ?? "—"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd></div>)}
          </dl>
          <div className="mt-4"><p className="text-xs font-medium text-slate-500">Business purpose</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{valueString(selected, "description")}</p></div>
          {valueString(selected, "receipt_url") && <a href={valueString(selected, "receipt_url")} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:underline"><FileText className="size-4" />Open supporting document</a>}
          {canManage && ["pending", "under_review"].includes(valueString(selected, "status")) && <div className="mt-5 flex justify-end gap-2 border-t pt-4">
            {valueString(selected, "status") === "pending" && <Button onClick={() => advance(selected)} disabled={busy || !valueString(selected, "receipt_url")}><ShieldCheck />Verify receipt & begin HR review</Button>}
            {valueString(selected, "status") === "under_review" && <Button onClick={() => setFinanceHandoff(selected)} disabled={busy || valueString(selected, "verification_status") !== "verified"}>Send to Finance</Button>}
            <Button variant="ghost" className="text-red-700" onClick={() => { setRejection(selected); setRejectionReason(""); }} disabled={busy}><X />Reject</Button>
          </div>}
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(financeHandoff)} onOpenChange={(open) => { if (!open && !busy) setFinanceHandoff(null); }}>
      <DialogContent>
        <DialogTitle>Send claim to Finance?</DialogTitle>
        <DialogDescription>{financeHandoff ? `${valueString(financeHandoff, "claim_number")} · ${employeeName(financeHandoff)}` : ""} The claim will be queued for Finance review. This system does not approve or disburse reimbursements.</DialogDescription>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setFinanceHandoff(null)} disabled={busy}>Cancel</Button><Button onClick={sendToFinance} disabled={busy}>{busy ? "Sending…" : "Confirm handoff"}</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(rejection)} onOpenChange={(open) => { if (!open && !busy) setRejection(null); }}>
      <DialogContent>
        <DialogTitle>Reject claim?</DialogTitle>
        <DialogDescription>{rejection ? `${valueString(rejection, "claim_number")} · ${employeeName(rejection)}` : ""}</DialogDescription>
        <label className="mt-4 block text-sm font-medium text-slate-700">Reason for rejection <span className="text-red-600">*</span><textarea rows={4} maxLength={1000} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="mt-1.5 w-full rounded-lg border p-3 text-sm font-normal" required /></label>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRejection(null)} disabled={busy}>Cancel</Button><Button variant="danger" onClick={rejectClaim} disabled={busy || !rejectionReason.trim()}><X />Confirm rejection</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
