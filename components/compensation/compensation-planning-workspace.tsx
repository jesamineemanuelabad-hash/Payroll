"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FilePlus2, Scale, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { saveRecord, type CompensationPlanningSnapshot } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CompactMetric, OperationsPageHeader, TableStatus } from "@/components/shared/operations-ui";
import { RecordWorkspace } from "@/components/records/record-workspace";
import type { RecordPageAccess } from "@/components/records/record-page";
import { EmployeeCredentialTab } from "@/components/compensation/employee-credential-tab";
import { PositionCriteriaTab } from "@/components/compensation/position-criteria-tab";
import { SalaryProposalsTab } from "@/components/compensation/salary-proposals-tab";

export type CompensationTab = "planning" | "proposals" | "criteria" | "credentials" | "cycles";
type Props = RecordPageAccess & { snapshot: CompensationPlanningSnapshot | null; error?: string; initialTab?: CompensationTab };

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const noEmployees: CompensationPlanningSnapshot["employees"] = [];

function formatSalary(value: number | null) {
  return value === null ? "Not recorded" : money.format(value);
}

function rangeState(employee: CompensationPlanningSnapshot["employees"][number]) {
  if (employee.salaryMin === null || employee.monthlySalary === null) return "Not assessed";
  if (employee.monthlySalary < employee.salaryMin) return "Below range";
  if (!employee.salaryMaxOpen && employee.salaryMax !== null && employee.monthlySalary > employee.salaryMax) return "Above range";
  return "Within range";
}

function salaryTone(state: string): "slate" | "amber" | "green" | "red" {
  if (state === "Within range") return "green";
  if (state === "Below range" || state === "Above range") return "amber";
  return "slate";
}

function isCredentialCurrent(employee: CompensationPlanningSnapshot["employees"][number], name: string) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return employee.credentials.some((credential) =>
    credential.verificationStatus === "verified" &&
    credential.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase() &&
    (!credential.expiresOn || credential.expiresOn >= today),
  );
}

export function CompensationPlanningWorkspace({ snapshot, error, roles, configured, setupError, initialTab = "planning" }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<CompensationTab>(initialTab);
  const [viewCredentials, setViewCredentials] = useState<CompensationPlanningSnapshot["employees"][number] | null>(null);
  const [proposalEmployeeId, setProposalEmployeeId] = useState<string | null>(null);
  const [savingProposal, setSavingProposal] = useState(false);
  const [, startTransition] = useTransition();

  const PAGE_SIZE = 10;
  const employees = snapshot?.employees ?? noEmployees;
  const cycles = snapshot?.cycles ?? [];
  const query = search.trim().toLocaleLowerCase();
  const filteredEmployees = useMemo(() => {
    const result = employees.filter((employee) =>
      !query || [employee.name, employee.employeeNumber, employee.position, employee.department ?? ""]
        .some((value) => value.toLocaleLowerCase().includes(query)),
    );
    return result;
  }, [employees, query]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEmployees = filteredEmployees.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const firstVisiblePage = Math.max(1, Math.min(safePage - 1, totalPages - 2));
  const visiblePages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstVisiblePage + index);

  function handleSearchChange(value: string) {
    setSearch(value);
    setCurrentPage(1);
  }

  const assessed = employees.filter((employee) => rangeState(employee) !== "Not assessed").length;
  const belowRange = employees.filter((employee) => rangeState(employee) === "Below range").length;
  const unverified = employees.reduce((count, employee) =>
    count + employee.credentials.filter((credential) => credential.verificationStatus === "pending").length, 0);
  const canCreateProposals = configured && roles.some((role) => ["hr_admin", "hr_manager"].includes(role));
  async function addProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const employee = employees.find((item) => item.id === proposalEmployeeId);
    if (!employee || employee.salaryAmount === null) {
      toast.error("Salary proposal was not saved", { description: "Add an effective salary-history record before drafting a proposal." });
      return;
    }
    if (savingProposal) return;
    const formData = new FormData(event.currentTarget);
    setSavingProposal(true);
    try {
      const result = await saveRecord({
        entity: "compensation_reviews",
        values: {
          employee_id: employee.id,
          cycle_id: String(formData.get("cycleId") ?? ""),
          current_salary: employee.salaryAmount,
          proposed_salary: Number(formData.get("proposedSalary")),
          bonus: Number(formData.get("bonus") || 0),
          effective_date: String(formData.get("effectiveDate") ?? ""),
          justification: String(formData.get("justification") ?? ""),
          rejection_reason: null,
          status: "draft",
        },
      });
      if (!result.ok) {
        toast.error("Salary proposal was not saved", { description: result.message });
        return;
      }
      toast.success("Draft salary proposal created", {
        description: `The draft uses the employee’s current ${employee.salaryFrequency?.replace("_", " ") ?? ""} salary basis. It will not affect payroll unless separately approved and implemented.`,
      });
      setProposalEmployeeId(null);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Salary proposal was not saved", { description: "Refresh Salary Planning to verify the save before retrying." });
    } finally {
      setSavingProposal(false);
    }
  }

  return (
    <section className="mt-5 space-y-5">
      <OperationsPageHeader
        eyebrow="Compensation"
        title="Compensation Planning"
        description="Review each active employee’s current pay against the salary band for their position, and assess recorded credentials against HR-defined position criteria."
      />

      {error && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}

      <nav aria-label="Compensation planning sections" className="flex gap-2 overflow-x-auto border-b pb-3">
        <button type="button" onClick={() => setActiveTab("planning")} aria-current={activeTab === "planning" ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "planning" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>Salary Planning</button>
        <button type="button" onClick={() => setActiveTab("proposals")} aria-current={activeTab === "proposals" ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "proposals" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>Salary Proposals</button>
        <button type="button" onClick={() => setActiveTab("criteria")} aria-current={activeTab === "criteria" ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "criteria" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>Position Criteria</button>
        <button type="button" onClick={() => setActiveTab("credentials")} aria-current={activeTab === "credentials" ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "credentials" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>Record Credential</button>
        <button type="button" onClick={() => setActiveTab("cycles")} aria-current={activeTab === "cycles" ? "page" : undefined} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium ${activeTab === "cycles" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50"}`}>Compensation Cycle</button>
      </nav>

      {activeTab === "planning" && snapshot && <>
        <div className="space-y-5">
            <div className="grid overflow-hidden rounded-xl border bg-white sm:grid-cols-3">
              <CompactMetric label="Active employees" value={employees.length.toLocaleString()} helper="Included in compensation planning" icon={Award} />
              <CompactMetric label="Range assessed" value={`${assessed.toLocaleString()} / ${employees.length.toLocaleString()}`} helper="Current monthly-equivalent pay and position band available" icon={Scale} tone="success" />
              <CompactMetric label="Credentials pending review" value={unverified.toLocaleString()} helper={`${belowRange.toLocaleString()} employees below the configured position minimum`} icon={BadgeCheck} tone={unverified || belowRange ? "warning" : "default"} />
            </div>

            {!cycles.length && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm text-amber-900">Create a compensation cycle to enable salary proposal drafting.</p>
              <Button type="button" variant="secondary" onClick={() => setActiveTab("cycles")}>Open Compensation Cycle</Button>
            </div>}

            <div className="overflow-hidden rounded-xl border bg-white">
              <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
                <div className="relative max-w-md flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input aria-label="Search employees" value={search} onChange={(event) => handleSearchChange(event.target.value)} placeholder="Search employee, department, or position" className="pl-9" /></div>
                <p className="text-xs text-slate-500">{filteredEmployees.length} of {employees.length} employees</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                    <th className="px-4 py-3 font-medium">Employee / position</th><th className="px-4 py-3 font-medium">Current base pay</th><th className="px-4 py-3 font-medium">Position salary range (monthly)</th><th className="px-4 py-3 font-medium">Range review</th><th className="px-4 py-3 font-medium">Action</th>
                  </tr></thead>
                  <tbody>
                    {paginatedEmployees.map((employee) => {
                      const state = rangeState(employee);
                      return <tr key={employee.id} className="border-t align-top">
                        <td className="px-4 py-4"><p className="font-medium text-slate-900">{employee.name}</p><p className="mt-1 text-xs text-slate-500">{employee.employeeNumber} · {employee.department ?? "No department"} · {employee.position}</p></td>
                        <td className="px-4 py-4"><p className="font-medium">{formatSalary(employee.salaryAmount)}{employee.salaryFrequency && <span className="text-xs font-normal text-slate-500"> / {employee.salaryFrequency.replace("_", " ")}</span>}</p><p className="mt-1 text-xs text-slate-500">{employee.monthlySalary === null ? "No effective salary history" : `${money.format(employee.monthlySalary)} monthly equivalent`}</p></td>
                        <td className="px-4 py-4">{employee.salaryMin === null ? "Position band not configured" : <>{money.format(employee.salaryMin)} – {employee.salaryMaxOpen ? `${money.format(employee.salaryMax ?? 0)}+` : employee.salaryMax === null ? "No upper limit" : money.format(employee.salaryMax)}</>}</td>
                        <td className="px-4 py-4"><TableStatus label={state} tone={salaryTone(state)} /><p className="mt-2 max-w-52 text-xs text-slate-500">A planning indicator, not an automatic salary decision.</p></td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" aria-label="View credentials" title="View credentials" onClick={() => setViewCredentials(employee)}><Eye className="size-4" /></Button>
                            {employee.salaryAmount === null ? <span className="text-xs text-slate-500">Record current salary first</span> : canCreateProposals && <Button size="sm" variant="secondary" onClick={() => setProposalEmployeeId(employee.id)} title={!cycles.length ? "Create a compensation cycle before saving this proposal" : "Draft a salary proposal"}><FilePlus2 />Draft proposal</Button>}
                          </div>
                        </td>
                      </tr>;
                    })}
                    {filteredEmployees.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">No employees match this search.</td></tr>}
                  </tbody>
                </table>
              </div>
          {filteredEmployees.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-xs text-slate-500">
                Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length} employees
              </p>
              <nav aria-label="Salary planning pagination" className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={safePage === 1} onClick={() => setCurrentPage(1)} aria-label="First page"><ChevronsLeft className="size-4" /></Button>
                <Button variant="ghost" size="sm" disabled={safePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                {visiblePages.map((page) => <Button key={page} variant={page === safePage ? "primary" : "ghost"} size="sm" className="min-w-[2rem]" aria-current={page === safePage ? "page" : undefined} onClick={() => setCurrentPage(page)}>{page}</Button>)}
                <Button variant="ghost" size="sm" disabled={safePage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} aria-label="Next page"><ChevronRight className="size-4" /></Button>
                <Button variant="ghost" size="sm" disabled={safePage === totalPages} onClick={() => setCurrentPage(totalPages)} aria-label="Last page"><ChevronsRight className="size-4" /></Button>
              </nav>
            </div>
            )}
          </div>
        </div>
        <Dialog open={Boolean(proposalEmployeeId)} onOpenChange={(open) => { if (!open && !savingProposal) setProposalEmployeeId(null); }}>
          <DialogContent className="max-w-4xl">
            {(() => {
              const employee = employees.find((item) => item.id === proposalEmployeeId);
              if (!employee) return null;
              return <>
                <DialogTitle>Draft salary proposal</DialogTitle>
                <DialogDescription>{employee.name} · Current salary: {formatSalary(employee.salaryAmount)} per {employee.salaryFrequency?.replace("_", " ") ?? "pay basis"}. This keeps the existing frequency when implemented.</DialogDescription>
                {!cycles.length ? <div className="mt-5 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">Create a compensation cycle before saving a proposal.</p>
                  <div className="flex justify-end"><Button type="button" onClick={() => { setProposalEmployeeId(null); setActiveTab("cycles"); }}>Open Compensation Cycle</Button></div>
                </div> : <form onSubmit={addProposal} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">Review cycle
                    <select key={cycles.map((cycle) => cycle.id).join(":")} name="cycleId" required className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">
                      {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.name} · {cycle.status}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">Proposed salary (same frequency)
                    <Input name="proposedSalary" type="number" min="0" step="0.01" required className="mt-1.5" defaultValue={employee.salaryAmount ?? ""} />
                  </label>
                  <label className="text-sm font-medium text-slate-700">One-time bonus
                    <Input name="bonus" type="number" min="0" step="0.01" className="mt-1.5" defaultValue="0" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">Effective date
                    <Input name="effectiveDate" type="date" required className="mt-1.5" defaultValue={cycles[0]?.endsOn ?? ""} />
                  </label>
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">Justification
                    <textarea name="justification" required minLength={1} maxLength={4000} rows={4} className="mt-1.5 w-full rounded-lg border bg-white p-3 text-sm" placeholder="Explain the business and compensation rationale" />
                  </label>
                  <div className="flex justify-end gap-2 sm:col-span-2">
                    <Button type="button" variant="secondary" onClick={() => setProposalEmployeeId(null)} disabled={savingProposal}>Cancel</Button>
                    <Button type="submit" disabled={savingProposal}><FilePlus2 />{savingProposal ? "Saving…" : "Save draft proposal"}</Button>
                  </div>
                </form>}
              </>;
            })()}
          </DialogContent>
        </Dialog>
        <Dialog open={Boolean(viewCredentials)} onOpenChange={(open) => { if (!open) setViewCredentials(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogTitle>Credentials & Qualifications</DialogTitle>
            <DialogDescription>{viewCredentials?.name} · {viewCredentials?.position}</DialogDescription>
            {viewCredentials && (() => {
              const verified = viewCredentials.credentials.filter((credential) => credential.verificationStatus === "verified");
              const missingRequired = viewCredentials.criteria.filter((criterion) => criterion.criterionType === "required" && !isCredentialCurrent(viewCredentials, criterion.credentialName));
              
              if (viewCredentials.criteria.length === 0 && viewCredentials.credentials.length === 0) {
                return <p className="text-sm text-slate-500 mt-4">No criteria or credentials recorded for this employee.</p>;
              }

              return (
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-slate-900 text-sm border-b pb-2">Position Criteria</h3>
                    {viewCredentials.criteria.length === 0 ? <p className="text-xs text-slate-500">No criteria configured for this position.</p> : viewCredentials.criteria.map((criterion) => {
                      const matched = isCredentialCurrent(viewCredentials, criterion.credentialName);
                      return <div key={criterion.id} className="flex flex-wrap items-center gap-1.5 mt-2">
                        <TableStatus label={criterion.criterionType} tone={criterion.criterionType === "required" ? "indigo" : "slate"} />
                        <span className="text-xs text-slate-700">{criterion.credentialName}</span>
                        <TableStatus label={matched ? "Matched" : "Not matched"} tone={matched ? "green" : criterion.criterionType === "required" ? "amber" : "slate"} />
                      </div>;
                    })}
                  </div>

                  <div className="space-y-2 pt-2">
                    <h3 className="font-semibold text-slate-900 text-sm border-b pb-2">Employee Credentials</h3>
                    {verified.length > 0 && <p className="text-xs text-slate-700 mt-2"><span className="font-medium text-slate-900">Verified on file:</span> {verified.map((credential) => credential.name).join(", ")}</p>}
                    {missingRequired.length > 0 && <p className="text-xs font-medium text-amber-700 mt-1">Missing required: {missingRequired.map((criterion) => criterion.credentialName).join(", ")}</p>}
                    {viewCredentials.credentials.some((credential) => credential.verificationStatus === "pending") && <p className="text-xs text-slate-500 mt-1">Some credentials are pending verification and do not count as matches.</p>}
                    {viewCredentials.credentials.length === 0 && <p className="text-xs text-slate-500 mt-2">No credentials recorded.</p>}
                  </div>
                </div>
              );
            })()}
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setViewCredentials(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      </>}
      {activeTab === "planning" && !snapshot && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Salary planning data is unavailable. Check the database connection and migrations.</p>}
      {activeTab === "proposals" && <SalaryProposalsTab roles={roles} configured={configured} setupError={setupError} />}
      {activeTab === "criteria" && <PositionCriteriaTab roles={roles} configured={configured} setupError={setupError} snapshot={snapshot} />}
      {activeTab === "credentials" && <EmployeeCredentialTab roles={roles} configured={configured} setupError={setupError} snapshot={snapshot} />}
      {activeTab === "cycles" && <RecordWorkspace entityKeys={["compensation_cycles"]} roles={roles} configured={configured} setupError={setupError} hideDataControls />}
    </section>
  );
}
