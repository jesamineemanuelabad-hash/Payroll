"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, Search, X } from "lucide-react";
import { toast } from "sonner";
import { readRecords, saveRecord } from "@/app/actions/records";
import { calculateLeaveBalances } from "@/lib/leave/balances";
import { leaveBalancePolicies, leaveTypeCatalog } from "@/lib/leave/types";
import type { RecordRow } from "@/lib/records/config";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type LeaveTab = "Requests" | "Employee balances" | "Leave types";
type LeaveStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
type Decision = { row: RecordRow; status: "approved" | "rejected" } | null;

const statuses: Array<"all" | LeaveStatus> = ["all", "submitted", "approved", "rejected", "draft", "cancelled"];
const pretty = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const valueString = (row: RecordRow, key: string) => String(row[key] ?? "");
const statusTone: Record<LeaveStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function statusValue(row: RecordRow): LeaveStatus {
  const value = valueString(row, "status");
  return statuses.includes(value as LeaveStatus) && value !== "all" ? value as LeaveStatus : "draft";
}

function typeLabel(value: string) {
  return leaveTypeCatalog.find((type) => type.value === value)?.label ?? pretty(value);
}

export function LeaveManagement({ roles, configured }: { roles: string[]; configured: boolean }) {
  const [activeTab, setActiveTab] = useState<LeaveTab>("Requests");
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [employees, setEmployees] = useState<RecordRow[]>([]);
  const [employeeLabels, setEmployeeLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [balanceSearch, setBalanceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | LeaveStatus>("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const [balanceEmployee, setBalanceEmployee] = useState<RecordRow | null>(null);
  const [decision, setDecision] = useState<Decision>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, startTransition] = useTransition();
  const canReview = roles.some((role) => ["super_admin", "hr_admin", "hr_manager"].includes(role));

  const refresh = useCallback(async () => {
    if (!configured) {
      setRows([]);
      setLoading(false);
      setError("Connect Supabase and apply the payroll engine migration to load leave requests.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      async function readAll(entity: "leave_requests" | "profiles") {
        const allRows: RecordRow[] = [];
        let count = 1;
        for (let currentPage = 0; allRows.length < count; currentPage += 1) {
          const result = await readRecords({ entity, size: 1000, page: currentPage });
          if (!result.ok) throw new Error(result.message);
          count = result.data.count;
          allRows.push(...result.data.rows);
          if (!result.data.rows.length) break;
        }
        return allRows;
      }
      const [allRows, allEmployees] = await Promise.all([readAll("leave_requests"), readAll("profiles")]);
      setRows(allRows);
      setEmployees(allEmployees);
      setEmployeeLabels(Object.fromEntries(allEmployees.map((employee) => [
        valueString(employee, "id"),
        `${valueString(employee, "employee_number")} · ${valueString(employee, "first_name")} ${valueString(employee, "last_name")}`.trim(),
      ])));
    } catch (cause) {
      setRows([]);
      setEmployees([]);
      setError(cause instanceof Error ? cause.message : "Unable to load leave management data. Refresh and try again.");
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

  const counts = useMemo(() => ({
    submitted: rows.filter((row) => statusValue(row) === "submitted").length,
    approved: rows.filter((row) => statusValue(row) === "approved").length,
    rejected: rows.filter((row) => statusValue(row) === "rejected").length,
  }), [rows]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const currentStatus = statusValue(row);
      const employee = employeeLabels[valueString(row, "employee_id")] ?? "";
      const text = `${employee} ${valueString(row, "leave_type")} ${valueString(row, "start_date")} ${valueString(row, "end_date")} ${valueString(row, "reason")}`.toLowerCase();
      return (statusFilter === "all" || currentStatus === statusFilter) && (!query || text.includes(query));
    }).sort((a, b) => valueString(b, "start_date").localeCompare(valueString(a, "start_date")));
  }, [employeeLabels, rows, search, statusFilter]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const employeeName = (row: RecordRow) => employeeLabels[valueString(row, "employee_id")] ?? "Employee record";
  const year = new Date().getFullYear();
  const balanceEmployees = useMemo(() => {
    const query = balanceSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      if (!["active", "on_leave"].includes(valueString(employee, "employment_status"))) return false;
      const name = `${valueString(employee, "employee_number")} ${valueString(employee, "first_name")} ${valueString(employee, "last_name")}`.toLowerCase();
      return !query || name.includes(query);
    }).sort((a, b) => valueString(a, "last_name").localeCompare(valueString(b, "last_name")));
  }, [balanceSearch, employees]);
  const balancePageCount = Math.max(1, Math.ceil(balanceEmployees.length / pageSize));
  const balancePageRows = balanceEmployees.slice(page * pageSize, (page + 1) * pageSize);
  const employeeLeaveRequests = (employee: RecordRow) => rows.filter((row) => valueString(row, "employee_id") === valueString(employee, "id"));
  const balancesFor = (employee: RecordRow) => calculateLeaveBalances(
    employeeLeaveRequests(employee).map((row) => ({
      leave_type: valueString(row, "leave_type"),
      start_date: valueString(row, "start_date"),
      total_days: Number(row.total_days),
      is_paid: Boolean(row.is_paid),
      status: statusValue(row),
    })),
    year,
  );
  const employeeDisplayName = (employee: RecordRow) => `${valueString(employee, "first_name")} ${valueString(employee, "last_name")}`.trim();

  function decide(row: RecordRow, nextStatus: "approved" | "rejected") {
    setDecision({ row, status: nextStatus });
    setRejectionReason("");
  }

  function saveDecision() {
    if (!decision) return;
    if (decision.status === "rejected" && !rejectionReason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    startTransition(async () => {
      const row = decision.row;
      const result = await saveRecord({
        entity: "leave_requests",
        id: row.id,
        version: row.updated_at,
        values: {
          employee_id: valueString(row, "employee_id"),
          leave_type: valueString(row, "leave_type"),
          start_date: valueString(row, "start_date"),
          end_date: valueString(row, "end_date"),
          total_days: Number(row.total_days),
          is_paid: Boolean(row.is_paid),
          reason: valueString(row, "reason"),
          status: decision.status,
          rejection_reason: decision.status === "rejected" ? rejectionReason.trim() : null,
        },
      });
      if (!result.ok) {
        toast.error(`Leave request ${decision.status === "approved" ? "approval" : "rejection"} failed`, { description: result.message });
        return;
      }
      toast.success(`Leave request ${decision.status}`);
      setDecision(null);
      setDetail(null);
      await refresh();
    });
  }

  return <section className="mt-5 space-y-5">
    <div>
      <h2 className="text-xl font-semibold text-slate-950">Leave management</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Review employee leave requests and see the leave categories currently supported by the system. There is no employee request form in this workspace.</p>
    </div>
    {!configured && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {configured && !canReview && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Leave requests are restricted to HR Admin, HR Manager, and Super Admin roles.</p>}
    <nav aria-label="Leave management sections" className="flex gap-2 overflow-x-auto border-b">
      {(["Requests", "Employee balances", "Leave types"] as const).map((tab) => <button key={tab} type="button" onClick={() => { setActiveTab(tab); setPage(0); }} aria-selected={activeTab === tab} role="tab" className={`relative shrink-0 px-4 py-3 text-sm font-medium ${activeTab === tab ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab}</button>)}
    </nav>

    {activeTab === "Requests" && <>
      <section aria-label="Leave request summary" className="grid gap-3 sm:grid-cols-3">
        {[["Pending requests", counts.submitted, "Awaiting HR decision", "amber"], ["Approved requests", counts.approved, "Approved leave on record", "green"], ["Rejected requests", counts.rejected, "Rejection reason retained", "red"]].map(([label, count, helper, tone]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`size-2 rounded-full ${tone === "amber" ? "bg-amber-500" : tone === "green" ? "bg-emerald-500" : "bg-rose-500"}`} /></div><p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">{count}</p><p className="mt-1 text-xs text-slate-500">{helper}</p></div>)}
      </section>
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-sm font-semibold text-slate-900">Employee leave requests</h3><p className="mt-1 text-xs text-slate-500">Select a request row to review its dates, reason, and decision history.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search employee or leave type…" aria-label="Search leave requests" className="pl-9 sm:w-64" /></div>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as "all" | LeaveStatus); setPage(0); }} aria-label="Filter leave request status" className="h-9 rounded-lg border bg-white px-3 text-sm">
              {statuses.map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : pretty(status)}</option>)}
            </select>
          </div>
        </div>
        {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Employee", "Leave type", "Dates", "Days", "Paid", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
          <tbody>{pageRows.map((row) => {
            const status = statusValue(row);
            return <tr key={row.id} className="cursor-pointer border-t hover:bg-slate-50/70" onClick={() => setDetail(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetail(row); } }} tabIndex={0} role="button" aria-label={`View ${typeLabel(valueString(row, "leave_type"))} request for ${employeeName(row)}`}>
              <td className="px-4 py-3"><p className="font-medium text-slate-900">{employeeName(row)}</p></td>
              <td className="px-4 py-3">{typeLabel(valueString(row, "leave_type"))}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{valueString(row, "start_date")} – {valueString(row, "end_date")}</td>
              <td className="px-4 py-3 tabular-nums">{Number(row.total_days).toLocaleString()}</td>
              <td className="px-4 py-3">{Boolean(row.is_paid) ? "Paid" : "Unpaid"}</td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[status]}`}>{pretty(status)}</span></td>
              <td className="px-4 py-3"><div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" aria-label="View leave request" onClick={(event) => { event.stopPropagation(); setDetail(row); }}><Eye /></Button>
                {canReview && status === "submitted" && <>
                  <Button type="button" variant="ghost" size="icon" aria-label="Approve leave request" className="text-emerald-700" onClick={(event) => { event.stopPropagation(); decide(row, "approved"); }}><Check /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Reject leave request" className="text-red-600" onClick={(event) => { event.stopPropagation(); decide(row, "rejected"); }}><X /></Button>
                </>}
              </div></td>
            </tr>;
          })}
          {!pageRows.length && <tr><td colSpan={7} className="px-4 py-14 text-center text-sm text-slate-500">{loading ? "Loading leave requests…" : error ? "Leave requests could not be loaded." : rows.length ? "No requests match these filters." : "No leave requests are recorded yet."}</td></tr>}
          </tbody>
        </table></div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{filteredRows.length} requests · Page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft />Previous</Button><Button variant="secondary" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight /></Button></div></div>
      </section>
    </>}

    {activeTab === "Employee balances" && <>
      <section className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-sm font-semibold text-slate-900">Employee leave balances</h3><p className="mt-1 text-xs text-slate-500">Current calendar-year credits minus approved paid leave.</p></div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={balanceSearch} onChange={(event) => { setBalanceSearch(event.target.value); setPage(0); }} placeholder="Search employee…" aria-label="Search employee leave balances" className="pl-9 sm:w-64" /></div>
        </div>
        {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Employee", "Vacation / annual / SIL", "Sick leave", "Action"].map((heading) => <th key={heading} className="px-4 py-3 font-medium">{heading}</th>)}</tr></thead>
          <tbody>{balancePageRows.map((employee) => {
            const [vacation, sick] = balancesFor(employee);
            return <tr key={valueString(employee, "id")} className="border-t hover:bg-slate-50/70">
              <td className="px-4 py-3"><p className="font-medium text-slate-900">{employeeDisplayName(employee)}</p><p className="mt-0.5 text-xs text-slate-500">{valueString(employee, "employee_number")}</p></td>
              {[vacation, sick].map((balance) => <td key={balance.key} className="px-4 py-3 tabular-nums"><span className="font-semibold text-slate-900">{balance.remaining.toFixed(1)} days</span><span className="ml-2 text-xs text-slate-500">of {balance.entitlement} · {balance.used.toFixed(1)} used</span></td>)}
              <td className="px-4 py-3"><Button type="button" variant="ghost" size="icon" aria-label={`View ${employeeDisplayName(employee)} leave balance`} onClick={() => setBalanceEmployee(employee)}><Eye /></Button></td>
            </tr>;
          })}
          {!balancePageRows.length && <tr><td colSpan={4} className="px-4 py-14 text-center text-sm text-slate-500">{loading ? "Loading employee balances…" : error ? "Employee balances could not be loaded." : "No employees match this search."}</td></tr>}</tbody>
        </table></div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{balanceEmployees.length} employees · Page {page + 1} of {balancePageCount}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}><ChevronLeft />Previous</Button><Button variant="secondary" size="sm" disabled={page + 1 >= balancePageCount} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight /></Button></div></div>
      </section>
    </>}

    {activeTab === "Leave types" && <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {leaveTypeCatalog.map((type) => {
          const typeRows = rows.filter((row) => valueString(row, "leave_type") === type.value);
          const approvedRows = typeRows.filter((row) => statusValue(row) === "approved");
          const approvedDays = approvedRows
            .filter((row) => Number(valueString(row, "start_date").slice(0, 4)) === year)
            .reduce((total, row) => total + Number(row.total_days), 0);
          const policy = leaveBalancePolicies.find((item) => item.leaveTypes.some((leaveType) => leaveType === type.value));
          return <article key={type.value} className="rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">{type.label}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{type.description}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{typeRows.length} requests</span></div>
            {policy && <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800">{policy.annualEntitlement} days per calendar year · shared bank</p>}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><div><p className="text-slate-500">Approved requests</p><p className="mt-1 font-semibold text-slate-800">{approvedRows.length}</p></div><div><p className="text-slate-500">Approved days in {year}</p><p className="mt-1 font-semibold text-slate-800">{approvedDays.toFixed(1)}</p></div></div>
          </article>;
        })}
      </section>
    </>}

    <Dialog open={Boolean(balanceEmployee)} onOpenChange={(open) => { if (!open) setBalanceEmployee(null); }}>
      <DialogContent className="max-w-2xl">
        {balanceEmployee && <>
          <DialogTitle>Leave balance</DialogTitle>
          <DialogDescription>{employeeDisplayName(balanceEmployee)} · {valueString(balanceEmployee, "employee_number")} · {year}</DialogDescription>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {balancesFor(balanceEmployee).map((balance) => <article key={balance.key} className="rounded-xl border p-4">
              <h3 className="text-sm font-semibold text-slate-900">{balance.label}</h3>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-indigo-700">{balance.remaining.toFixed(1)} <span className="text-sm font-medium text-slate-500">days available</span></p>
              <dl className="mt-4 space-y-2 border-t pt-3 text-sm">
                {[["Annual entitlement", `${balance.entitlement} days`], ["Approved paid leave used", `${balance.used.toFixed(1)} days`]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="font-medium tabular-nums text-slate-900">{value}</dd></div>)}
              </dl>
            </article>)}
          </div>
          <div className="mt-5"><h3 className="text-sm font-semibold text-slate-900">Other approved leave this year</h3><div className="mt-2 divide-y rounded-lg border">
            {leaveTypeCatalog.filter((type) => !leaveBalancePolicies.some((policy) => policy.leaveTypes.some((leaveType) => leaveType === type.value))).map((type) => {
              const days = employeeLeaveRequests(balanceEmployee)
                .filter((row) => valueString(row, "leave_type") === type.value && statusValue(row) === "approved" && Number(valueString(row, "start_date").slice(0, 4)) === year)
                .reduce((total, row) => total + Number(row.total_days), 0);
              return <div key={type.value} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="text-slate-600">{type.label}</span><span className="font-medium tabular-nums text-slate-900">{days.toFixed(1)} days</span></div>;
            })}
          </div></div>
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}>
      <DialogContent className="max-w-2xl">
        {detail && <>
          <DialogTitle>Leave request details</DialogTitle>
          <DialogDescription>{employeeName(detail)} · {typeLabel(valueString(detail, "leave_type"))}</DialogDescription>
          <dl className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            {[["Start date", valueString(detail, "start_date")], ["End date", valueString(detail, "end_date")], ["Requested days", Number(detail.total_days).toLocaleString()], ["Paid leave", Boolean(detail.is_paid) ? "Yes" : "No"], ["Status", pretty(statusValue(detail))], ["Submitted", valueString(detail, "created_at") ? new Date(valueString(detail, "created_at")).toLocaleString() : "Not recorded"]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd></div>)}
          </dl>
          <div className="mt-4"><p className="text-xs font-medium text-slate-500">Reason</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{valueString(detail, "reason") || "No reason provided."}</p></div>
          {statusValue(detail) === "rejected" && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs font-semibold text-red-800">Rejection reason</p><p className="mt-1 text-sm leading-5 text-red-800">{valueString(detail, "rejection_reason")}</p></div>}
          {canReview && statusValue(detail) === "submitted" && <div className="mt-5 flex justify-end gap-2 border-t pt-4"><Button variant="secondary" onClick={() => decide(detail, "rejected")}><X />Reject</Button><Button onClick={() => decide(detail, "approved")}><Check />Approve</Button></div>}
        </>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(decision)} onOpenChange={(open) => { if (!open && !busy) setDecision(null); }}>
      <DialogContent>
        <DialogTitle>{decision?.status === "approved" ? "Approve leave request?" : "Reject leave request?"}</DialogTitle>
        <DialogDescription>{decision ? `${employeeName(decision.row)} · ${typeLabel(valueString(decision.row, "leave_type"))} · ${valueString(decision.row, "start_date")} – ${valueString(decision.row, "end_date")}` : ""}</DialogDescription>
        {decision?.status === "approved" ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">Approval is recorded in the audit history. If this request is paid, it will be included the next time an overlapping draft payroll run is calculated.</p> : <label className="mt-4 block text-sm font-medium text-slate-700">Reason for rejection <span className="text-red-600">*</span><textarea rows={4} maxLength={1000} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="mt-1.5 w-full rounded-lg border p-3 text-sm font-normal" placeholder="Explain why this request is being rejected." required /></label>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setDecision(null)} disabled={busy}>Cancel</Button><Button onClick={saveDecision} disabled={busy || (decision?.status === "rejected" && !rejectionReason.trim())}>{busy ? "Saving…" : decision?.status === "approved" ? "Confirm approval" : "Confirm rejection"}</Button></div>
      </DialogContent>
    </Dialog>
  </section>;
}
