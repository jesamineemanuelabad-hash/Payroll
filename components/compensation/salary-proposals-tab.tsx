"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Eye, FileCheck2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { readRecords, resolveRecordLabels, saveRecord } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CompactMetric, TableStatus } from "@/components/shared/operations-ui";
import type { RecordPageAccess } from "@/components/records/record-page";
import type { RecordRow } from "@/lib/records/config";

type Props = RecordPageAccess;
type Proposal = RecordRow & {
  employee_id?: string;
  cycle_id?: string;
  current_salary?: number;
  proposed_salary?: number;
  adjustment_amount?: number;
  increase_percentage?: number;
  effective_date?: string;
  within_budget?: boolean;
  budget_remaining_after?: number;
  status?: string;
  justification?: string;
  rejection_reason?: string | null;
  bonus?: number;
  submitted_by?: string | null;
  simulation_submitter?: string | null;
  simulation_hr_reviewer?: string | null;
  simulation_finance_reviewer?: string | null;
};

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const hrRoles = ["super_admin", "hr_admin", "hr_manager"];
const financeRoles = ["super_admin", "payroll_manager"];

function statusTone(status: string): "slate" | "amber" | "green" | "red" | "indigo" {
  if (status === "approved" || status === "implemented") return "green";
  if (status === "rejected") return "red";
  if (status === "finance_review") return "indigo";
  if (status === "pending" || status === "hr_review") return "amber";
  return "slate";
}

function amount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? money.format(value) : "—";
}

export function SalaryProposalsTab({ roles, configured, setupError }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const [confirmation, setConfirmation] = useState<{ proposal: Proposal; status: "pending" | "hr_review" | "finance_review" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pageSize = 10;
  const canReviewHr = configured && roles.some((role) => hrRoles.includes(role));
  const canReviewFinance = configured && roles.some((role) => financeRoles.includes(role));

  const loadData = useCallback(async () => {
      const collected: Proposal[] = [];
      let total = 1;
      for (let pageIndex = 0; collected.length < total; pageIndex += 1) {
        const result = await readRecords({ entity: "compensation_reviews", page: pageIndex, size: 1000 });
        if (!result.ok) throw new Error(result.message);
        total = result.data.count;
        collected.push(...result.data.rows as Proposal[]);
        if (!result.data.rows.length) break;
      }
      const employeeIds = [...new Set(collected.flatMap((proposal) => [proposal.employee_id, proposal.submitted_by].filter((id): id is string => Boolean(id))))];
      const cycleIds = [...new Set(collected.map((proposal) => proposal.cycle_id).filter((id): id is string => Boolean(id)))];
      const resolved: Record<string, string> = {};
      for (let offset = 0; offset < Math.max(employeeIds.length, cycleIds.length); offset += 100) {
        Object.assign(resolved, await resolveRecordLabels([
          { entity: "profiles", ids: employeeIds.slice(offset, offset + 100) },
          { entity: "compensation_cycles", ids: cycleIds.slice(offset, offset + 100) },
        ]));
      }
      return { proposals: collected, labels: resolved };
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const result = await loadData();
      if (!result) return;
      setProposals(result.proposals);
      setLabels(result.labels);
      setError("");
    } catch {
      setError("Unable to load salary proposals. Check the connection and try again.");
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [configured, loadData]);

  useEffect(() => {
    if (!configured) return;
    let current = true;
    loadData().then((result) => {
      if (!current) return;
      setProposals(result.proposals);
      setLabels(result.labels);
      setError("");
      setLoading(false);
    }).catch((cause: unknown) => {
      if (!current) return;
      setError(cause instanceof Error && cause.message ? cause.message : "Unable to load salary proposals. Check the connection and try again.");
      setProposals([]);
      setLoading(false);
    });
    return () => { current = false; };
  }, [configured, loadData]);

  const summary = useMemo(() => ({
    drafts: proposals.filter((proposal) => proposal.status === "draft").length,
    pending: proposals.filter((proposal) => ["pending", "hr_review", "finance_review"].includes(String(proposal.status))).length,
    approved: proposals.filter((proposal) => ["approved", "implemented"].includes(String(proposal.status))).length,
    rejected: proposals.filter((proposal) => proposal.status === "rejected").length,
  }), [proposals]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return proposals.filter((proposal) => !query || [
      labels[proposal.employee_id ?? ""] ?? "",
      labels[proposal.cycle_id ?? ""] ?? "",
      String(proposal.status ?? ""),
      String(proposal.justification ?? ""),
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [labels, proposals, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  async function updateStatus(proposal: Proposal, status: string, rejectionReason: string | null = null) {
    if (busyId) return;
    setBusyId(proposal.id);
    try {
      const result = await saveRecord({
        entity: "compensation_reviews",
        id: proposal.id,
        version: proposal.updated_at,
        values: {
          employee_id: proposal.employee_id,
          cycle_id: proposal.cycle_id,
          current_salary: Number(proposal.current_salary),
          proposed_salary: Number(proposal.proposed_salary),
          bonus: Number(proposal.bonus ?? 0),
          effective_date: proposal.effective_date,
          justification: proposal.justification ?? "",
          rejection_reason: rejectionReason ?? proposal.rejection_reason ?? null,
          status,
        },
      });
      if (!result.ok) {
        toast.error("Proposal was not updated", { description: result.message });
        return;
      }
      toast.success(status === "rejected" ? "Proposal rejected" : status === "approved" ? "Proposal approved" : status === "pending" ? "Proposal submitted for review" : status === "hr_review" ? "HR review started" : "Sent for Finance review");
      setRejecting(null);
      setConfirmation(null);
      setSelected(null);
      await refresh();
    } catch {
      toast.error("Proposal was not updated", { description: "Refresh the proposal list to verify the result before retrying." });
    } finally {
      setBusyId(null);
    }
  }

  async function rejectProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejecting) return;
    const formData = new FormData(event.currentTarget);
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 2) {
      toast.error("Enter a rejection reason");
      return;
    }
    await updateStatus(rejecting, "rejected", reason);
  }

  function actions(proposal: Proposal) {
    const status = String(proposal.status ?? "");
    const busy = busyId === proposal.id;
    if (status === "draft" && canReviewHr) {
      return <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmation({ proposal, status: "pending" })}><FileCheck2 />Submit for review</Button>;
    }
    if (status === "pending" && canReviewHr) {
      return <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmation({ proposal, status: "hr_review" })}><FileCheck2 />Start HR review</Button>;
    }
    if (status === "hr_review") {
      return <div className="flex flex-wrap gap-1">
        {canReviewHr && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmation({ proposal, status: "finance_review" })}>Send to Finance</Button>}
        {canReviewHr && <Button size="sm" variant="ghost" disabled={busy} className="text-red-700" onClick={() => setRejecting(proposal)}><X className="size-4" />Reject</Button>}
      </div>;
    }
    if (status === "finance_review") return <span className="text-xs font-medium text-indigo-700">Awaiting Finance review outside this system</span>;
    return <span className="text-xs text-slate-400">No action</span>;
  }

  return <div className="space-y-5">
    {setupError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{setupError}</p>}
    <div className="grid overflow-hidden rounded-xl border bg-white sm:grid-cols-2 xl:grid-cols-4">
      <CompactMetric label="Draft proposals" value={summary.drafts.toLocaleString()} helper="Saved, not yet submitted" icon={FileCheck2} />
      <CompactMetric label="Pending approval" value={summary.pending.toLocaleString()} helper="Pending, HR review, or Finance review" icon={FileCheck2} tone={summary.pending ? "warning" : "default"} />
      <CompactMetric label="Approved" value={summary.approved.toLocaleString()} helper="Approved or implemented" icon={Check} tone="success" />
      <CompactMetric label="Rejected" value={summary.rejected.toLocaleString()} helper="Decision recorded with reason" icon={X} tone={summary.rejected ? "warning" : "default"} />
    </div>
    {configured && !canReviewHr && !canReviewFinance && <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">Read-only access. HR and Finance reviewers can manage proposal decisions.</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
        <div><h2 className="font-semibold text-slate-900">Salary Proposals</h2><p className="mt-1 text-sm text-slate-500">Move proposals through HR review, then hand them off for Finance review and implementation.</p></div>
        <div className="relative sm:ml-auto sm:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search salary proposals" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search employee, cycle, status…" className="pl-9" /></div>
      </div>
      <div className="overflow-x-auto" aria-busy={loading}>
        <table className="w-full min-w-[1350px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>
            <th className="px-4 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Submitted by</th><th className="px-4 py-3 font-medium">Review cycle</th><th className="px-4 py-3 font-medium">Current salary</th><th className="px-4 py-3 font-medium">Proposed salary</th><th className="px-4 py-3 font-medium">Adjustment</th><th className="px-4 py-3 font-medium">Increase</th><th className="px-4 py-3 font-medium">Effective date</th><th className="px-4 py-3 font-medium">Within budget</th><th className="px-4 py-3 font-medium">Budget remaining</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((proposal) => <tr key={proposal.id} className="border-t align-top">
              <td className="px-4 py-3 font-medium text-slate-900">{labels[proposal.employee_id ?? ""] ?? "Employee name unavailable"}</td>
              <td className="px-4 py-3">{proposal.simulation_submitter ?? labels[proposal.submitted_by ?? ""] ?? (proposal.status === "draft" ? "Not submitted" : "—")}</td>
              <td className="px-4 py-3">{labels[proposal.cycle_id ?? ""] ?? "Cycle name unavailable"}</td>
              <td className="px-4 py-3">{amount(proposal.current_salary)}</td>
              <td className="px-4 py-3 font-medium">{amount(proposal.proposed_salary)}</td>
              <td className="px-4 py-3">{amount(proposal.adjustment_amount)}</td>
              <td className="px-4 py-3">{typeof proposal.increase_percentage === "number" ? `${proposal.increase_percentage.toFixed(2)}%` : "—"}</td>
              <td className="px-4 py-3">{proposal.effective_date ?? "—"}</td>
              <td className="px-4 py-3"><TableStatus label={proposal.within_budget ? "Within budget" : "Over budget"} tone={proposal.within_budget ? "green" : "amber"} /></td>
              <td className="px-4 py-3">{amount(proposal.budget_remaining_after)}</td>
              <td className="px-4 py-3"><TableStatus label={proposal.status === "finance_review" ? "For Finance Review" : String(proposal.status ?? "unknown").replaceAll("_", " ")} tone={statusTone(String(proposal.status ?? ""))} /></td>
              <td className="px-4 py-3"><div className="flex min-w-48 items-center gap-1"><Button size="icon" variant="ghost" aria-label="View proposal" title="View proposal" onClick={() => setSelected(proposal)}><Eye className="size-4" /></Button>{actions(proposal)}</div></td>
            </tr>)}
            {!rows.length && <tr><td colSpan={12} className="px-4 py-12 text-center text-sm text-slate-500">{loading ? "Loading proposals…" : error ? "Unable to display proposals." : search ? "No proposals match your search." : "No salary proposals recorded yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && <div className="flex items-center justify-between border-t px-4 py-3">
        <p className="text-xs text-slate-500">Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length} proposals</p>
        {totalPages > 1 && <div className="flex items-center gap-2"><Button size="sm" variant="secondary" disabled={safePage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span><Button size="sm" variant="secondary" disabled={safePage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</Button></div>}
      </div>}
    </div>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent className="max-w-2xl"><DialogTitle>Salary proposal details</DialogTitle><DialogDescription>{selected ? `${labels[selected.employee_id ?? ""] ?? "Employee"} · ${labels[selected.cycle_id ?? ""] ?? "Cycle"}` : ""}</DialogDescription>
        {selected && <dl className="mt-4 grid gap-x-6 divide-y sm:grid-cols-2">
          <div className="py-3"><dt className="text-xs text-slate-500">Current salary</dt><dd className="mt-1 text-sm font-medium">{amount(selected.current_salary)}</dd></div>
          <div className="py-3"><dt className="text-xs text-slate-500">Proposed salary</dt><dd className="mt-1 text-sm font-medium">{amount(selected.proposed_salary)}</dd></div>
          <div className="py-3 sm:col-span-2"><dt className="text-xs text-slate-500">Justification</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{selected.justification || "—"}</dd></div>
          <div className="py-3 sm:col-span-2"><dt className="text-xs text-slate-500">Rejection reason</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{selected.rejection_reason || "—"}</dd></div>
          {(selected.simulation_submitter || selected.simulation_hr_reviewer || selected.simulation_finance_reviewer) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
            <dt className="text-xs font-medium text-amber-900">Simulation-only workflow participants</dt>
            <dd className="mt-1 space-y-1 text-xs text-amber-800">
              <p>Submitted by: {selected.simulation_submitter ?? "—"}</p>
              <p>HR reviewer: {selected.simulation_hr_reviewer ?? "—"}</p>
              <p>Finance reviewer: {selected.simulation_finance_reviewer ?? "—"}</p>
              <p>These are fictional workflow personas, not user accounts or actual approvers. This proposal must not be implemented as real pay.</p>
            </dd>
          </div>}
        </dl>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open && !busyId) setRejecting(null); }}>
      <DialogContent><DialogTitle>Reject salary proposal</DialogTitle><DialogDescription>Provide a clear reason for the decision. This will be saved with the proposal.</DialogDescription>
        {rejecting && <form onSubmit={rejectProposal} className="mt-4 space-y-4"><label className="block text-sm font-medium text-slate-700">Rejection reason<textarea name="reason" required minLength={2} maxLength={1000} rows={4} className="mt-1.5 w-full rounded-lg border bg-white p-3 text-sm" placeholder="Explain why this proposal is rejected" /></label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busyId !== null} onClick={() => setRejecting(null)}>Cancel</Button><Button type="submit" disabled={busyId !== null} className="bg-red-600 hover:bg-red-700">{busyId ? "Saving…" : "Confirm rejection"}</Button></div></form>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !busyId) setConfirmation(null); }}>
      <DialogContent>
        <DialogTitle>{confirmation?.status === "finance_review" ? "Send proposal to Finance?" : confirmation?.status === "hr_review" ? "Start HR review?" : "Submit salary proposal for review?"}</DialogTitle>
        <DialogDescription>{confirmation?.status === "finance_review" ? "The proposal will be marked for Finance review. Finance approval and implementation take place outside this system." : "This changes the proposal to the next HR review stage."}</DialogDescription>
        {confirmation && <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={busyId !== null} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busyId !== null} onClick={() => void updateStatus(confirmation.proposal, confirmation.status)}>{busyId ? "Saving…" : confirmation.status === "finance_review" ? "Confirm handoff" : "Confirm"}</Button></div>}
      </DialogContent>
    </Dialog>
  </div>;
}
