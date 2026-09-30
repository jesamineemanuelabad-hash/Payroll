"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react";
import { toast } from "sonner";
import { readRecords, savePositionCredentialCriterion, type CompensationPlanningSnapshot } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableStatus } from "@/components/shared/operations-ui";
import type { RecordPageAccess } from "@/components/records/record-page";
import type { RecordRow } from "@/lib/records/config";

type Props = RecordPageAccess & { snapshot: CompensationPlanningSnapshot | null };

export function PositionCriteriaTab({ roles, configured, setupError, snapshot }: Props) {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const positions = snapshot?.positions ?? [];
  const canManage = configured && roles.some((role) => ["super_admin", "hr_admin"].includes(role));
  const positionById = new Map(positions.map((position) => [position.id, position]));
  const departments = [...new Set(positions.map((position) => position.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const query = search.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => {
    const position = positionById.get(String(row.job_position_id));
    return (!department || position?.department === department) &&
      (!query || [position?.department ?? "", position?.title ?? "", String(row.credential_name ?? ""), String(row.notes ?? ""), String(row.criterion_type ?? "")]
        .some((value) => value.toLocaleLowerCase().includes(query)));
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const firstVisiblePage = Math.max(1, Math.min(safePage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstVisiblePage + index);

  const loadCriteria = useCallback(() => {
    return configured
      ? readRecords({ entity: "job_position_credential_criteria", size: 1000 })
      : Promise.resolve(null);
  }, [configured]);

  const applyResult = useCallback((result: Awaited<ReturnType<typeof readRecords>> | null) => {
    if (!result) return;
    if (!result.ok) {
      setError(result.message);
      setRows([]);
    } else {
      setError("");
      setRows(result.data.rows);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      applyResult(await loadCriteria());
    } catch {
      setError("Unable to load position criteria. Check the connection and try again.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applyResult, configured, loadCriteria]);

  useEffect(() => {
    if (!configured) return;
    let current = true;
    loadCriteria().then((result) => {
      if (!current) return;
      applyResult(result);
      setLoading(false);
    }).catch(() => {
      if (!current) return;
      setError("Unable to load position criteria. Check the connection and try again.");
      setLoading(false);
    });
    return () => { current = false; };
  }, [applyResult, configured, loadCriteria]);

  async function addCriterion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    try {
      const result = await savePositionCredentialCriterion({
        positionId: String(formData.get("positionId") ?? ""),
        credentialName: String(formData.get("credentialName") ?? ""),
        criterionType: String(formData.get("criterionType") ?? "required"),
        notes: String(formData.get("notes") ?? "").trim() || null,
      });
      if (!result.ok) {
        toast.error("Position criterion was not saved", { description: result.message });
        return;
      }
      toast.success("Position criterion saved");
      form.reset();
      await refresh();
    } catch {
      toast.error("Position criterion was not saved", { description: "Check the connection, then retry." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {setupError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{setupError}</p>}
      {canManage && <form onSubmit={addCriterion} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4 border-b pb-3">
          <h2 className="text-lg font-semibold text-slate-900">Add position criterion</h2>
          <p className="mt-1 text-sm text-slate-500">Enter the credential or qualification HR requires or prefers for a specific position.</p>
        </div>
        <label className="text-sm font-medium text-slate-700">Department · position
          <select name="positionId" required disabled={!positions.length || saving} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="">Select position</option>
            {positions.map((position) => <option key={position.id} value={position.id}>{position.department} · {position.title}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Credential / qualification
          <Input name="credentialName" required minLength={2} maxLength={160} disabled={saving} className="mt-1.5" placeholder="Enter the position-specific criterion" />
        </label>
        <label className="text-sm font-medium text-slate-700">Requirement
          <select name="criterionType" required disabled={saving} defaultValue="required" className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="required">Required</option><option value="preferred">Preferred</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Notes
          <Input name="notes" maxLength={1000} disabled={saving} className="mt-1.5" placeholder="Optional" />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={saving || !positions.length}>{saving ? "Saving…" : "Save criterion"}</Button>
        </div>
      </form>}
      {configured && !canManage && <p className="text-sm text-slate-600">Read-only access. HR administrators can manage position criteria.</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <div className="overflow-hidden rounded-xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-slate-900">Position Criteria</h2>
            <p className="mt-1 text-sm text-slate-500">Requirements recorded for each catalog position.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input aria-label="Search position criteria" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search position criteria…" className="pl-9" />
            </div>
            <select aria-label="Filter by department" value={department} onChange={(event) => { setDepartment(event.target.value); setCurrentPage(1); }} className="h-10 rounded-lg border bg-white px-3 text-sm sm:min-w-52">
              <option value="">All departments</option>
              {departments.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3 font-medium">Department</th><th className="px-4 py-3 font-medium">Job position</th><th className="px-4 py-3 font-medium">Credential / qualification</th><th className="px-4 py-3 font-medium">Requirement</th><th className="px-4 py-3 font-medium">Notes</th></tr>
            </thead>
            <tbody>
              {paginatedRows.map((row) => {
                const position = positionById.get(String(row.job_position_id));
                return <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">{position?.department ?? "—"}</td>
                  <td className="px-4 py-3">{position?.title ?? "Position unavailable"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.credential_name}</td>
                  <td className="px-4 py-3"><TableStatus label={String(row.criterion_type)} tone={row.criterion_type === "required" ? "indigo" : "slate"} /></td>
                  <td className="px-4 py-3 text-slate-600">{row.notes || "—"}</td>
                </tr>;
              })}
              {!rows.length && !loading && !error && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No criteria recorded yet. Add position-specific criteria above.</td></tr>}
              {rows.length > 0 && !filteredRows.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No criteria match these search and department filters.</td></tr>}
              {loading && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Loading criteria…</td></tr>}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 0 && <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, filteredRows.length)} of {filteredRows.length} criteria</p>
          {totalPages > 1 && <nav aria-label="Position criteria pagination" className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label="First page" disabled={safePage === 1} onClick={() => setCurrentPage(1)}><ChevronsLeft className="size-4" /></Button>
            <Button variant="ghost" size="sm" aria-label="Previous page" disabled={safePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}><ChevronLeft className="size-4" /></Button>
            {visiblePages.map((page) => <Button key={page} variant={page === safePage ? "primary" : "ghost"} size="sm" className="min-w-[2rem]" aria-current={page === safePage ? "page" : undefined} onClick={() => setCurrentPage(page)}>{page}</Button>)}
            <Button variant="ghost" size="sm" aria-label="Next page" disabled={safePage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}><ChevronRight className="size-4" /></Button>
            <Button variant="ghost" size="sm" aria-label="Last page" disabled={safePage === totalPages} onClick={() => setCurrentPage(totalPages)}><ChevronsRight className="size-4" /></Button>
          </nav>}
        </div>}
      </div>
    </div>
  );
}
