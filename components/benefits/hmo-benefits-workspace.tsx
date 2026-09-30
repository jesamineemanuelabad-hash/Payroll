"use client";

import { useMemo, useState, useTransition } from "react";
import { BadgeCheck, HeartPulse, LoaderCircle, Search, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { saveHmoEnrollment, type HmoEmployee, type HmoSnapshot } from "@/app/actions/hmo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type FormValues = {
  packageId: string;
  status: "pending" | "active" | "waived" | "terminated";
  membershipNumber: string;
  effectiveDate: string;
  expirationDate: string;
  notes: string;
};

type HmoTab = "employees" | "packages" | "providers";

const statusLabel: Record<NonNullable<HmoEmployee["status"]>, string> = {
  pending: "Pending enrollment",
  active: "Enrolled",
  waived: "Waived",
  terminated: "Terminated",
};

export function HmoBenefitsWorkspace({ configured, canManage, initialSnapshot, initialError }: {
  configured: boolean;
  canManage: boolean;
  initialSnapshot: HmoSnapshot | null;
  initialError: string;
}) {
  const [snapshot, setSnapshot] = useState<HmoSnapshot | null>(initialSnapshot);
  const [error] = useState(initialError);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<HmoTab>("employees");
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<HmoEmployee | null>(null);
  const [busy, startTransition] = useTransition();
  const pageSize = 20;

  const employees = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (snapshot?.employees ?? []).filter((employee) =>
      (!eligibleOnly || employee.eligible)
      && (!search || `${employee.name} ${employee.employeeNumber} ${employee.departmentName ?? ""}`.toLowerCase().includes(search)),
    );
  }, [eligibleOnly, query, snapshot]);

  const eligibleCount = snapshot?.employees.filter((employee) => employee.eligible).length ?? 0;
  const enrolledCount = snapshot?.employees.filter((employee) => employee.status === "active").length ?? 0;
  const pendingCount = snapshot?.employees.filter((employee) => employee.status === "pending").length ?? 0;
  const pageCount = Math.max(1, Math.ceil(employees.length / pageSize));
  const visibleEmployees = employees.slice(page * pageSize, (page + 1) * pageSize);

  function openEditor(employee: HmoEmployee) {
    setEditing(employee);
  }

  function save(values: FormValues) {
    if (!editing) return;
    startTransition(async () => {
      const result = await saveHmoEnrollment({
        employeeId: editing.id,
        packageId: values.packageId,
        status: values.status,
        membershipNumber: values.membershipNumber.trim() || null,
        effectiveDate: values.effectiveDate || null,
        expirationDate: values.expirationDate || null,
        notes: values.notes.trim() || null,
      });
      if (!result.ok) {
        toast.error("HMO enrollment was not saved", { description: result.message });
        return;
      }
      setSnapshot((current) => current ? {
        ...current,
        employees: current.employees.map((employee) => employee.id === result.data.id ? result.data : employee),
      } : current);
      setEditing(null);
      toast.success("HMO enrollment updated", { description: `${result.data.name}'s package selection and enrollment details were saved.` });
    });
  }

  if (!configured) return <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Connect Supabase and apply the HMO management migration to use this section.</p>;
  if (!canManage) return <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{initialError || "HMO eligibility and enrollment details are restricted to HR administrators."}</p>;

  return <main className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Benefits Management</p>
      <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">HMO & Benefits</h1>
      <p className="max-w-3xl text-sm leading-6 text-slate-500">Review salary-based HMO tier qualification and enrollment details. Active payroll employees with a current salary record are matched to the configured monthly salary band.</p>
    </header>

    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <section aria-label="HMO summary" className="grid gap-3 sm:grid-cols-3">
      <Metric label="Eligible employees" value={snapshot ? eligibleCount.toLocaleString() : "—"} detail="Active payroll employees" icon={UsersRound} />
      <Metric label="Enrolled" value={snapshot ? enrolledCount.toLocaleString() : "—"} detail="Coverage status recorded as active" icon={BadgeCheck} />
      <Metric label="Pending enrollment" value={snapshot ? pendingCount.toLocaleString() : "—"} detail="Selected package; not yet active" icon={HeartPulse} />
    </section>

    <div role="tablist" aria-label="HMO and benefits sections" className="flex flex-wrap gap-2 border-b">
      {([
        ["employees", "Employee benefits"],
        ["packages", "HMO package tiers"],
        ["providers", "Providers"],
      ] as const).map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`hmo-tab-${tab}`}
          aria-selected={activeTab === tab}
          aria-controls={`hmo-panel-${tab}`}
          onClick={() => setActiveTab(tab)}
          className={`rounded-t-lg px-4 py-3 text-sm font-medium ${activeTab === tab ? "border-b-2 border-indigo-600 bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {label}
        </button>
      ))}
    </div>

    {activeTab === "packages" && <section role="tabpanel" id="hmo-panel-packages" aria-labelledby="hmo-tab-packages" className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">HMO package tiers</h2>
          <p className="mt-1 text-sm text-slate-500">Salary bands recommend a tier. Premiums below are planning estimates, not provider quotes.</p>
        </div>
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800">Eligibility: active payroll employee with current salary</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(snapshot?.packages ?? []).map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">{item.tier}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Provider</dt><dd className="text-right text-slate-700">{item.providerName ?? "Not assigned"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Monthly salary</dt><dd className="text-right text-slate-700">{`₱${item.salaryMin.toLocaleString("en-PH")}${item.salaryMax === null ? "+" : `–₱${item.salaryMax.toLocaleString("en-PH")}`}`}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Annual premium estimate</dt><dd className="text-right text-slate-700">{item.annualPremium === null ? "Not recorded" : `₱${item.annualPremium.toLocaleString("en-PH")}`}</dd></div>
            <div><dt className="text-slate-500">Coverage</dt><dd className="mt-0.5 text-slate-700">{item.coverageDetails || "Details not recorded"}</dd></div>
          </dl>
        </article>)}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">Premium amounts are planning estimates only and are not connected to a provider quote or payroll deduction.</p>
    </section>}

    {activeTab === "providers" && <section role="tabpanel" id="hmo-panel-providers" aria-labelledby="hmo-tab-providers" className="overflow-hidden rounded-xl border bg-white">
      <div className="border-b p-5">
        <h2 className="font-semibold text-slate-900">HMO providers</h2>
        <p className="mt-1 text-sm text-slate-500">Provider directory entries are not confirmation of a contract, selected plan, or quoted rate.</p>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {(snapshot?.providers ?? []).map((provider) => (
          <article key={provider.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{provider.name}</h3>
              <StatusPill label={provider.status === "active" ? "Available" : "Inactive"} positive={provider.status === "active"} />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {provider.packageTiers.length
                ? `Linked package tiers: ${provider.packageTiers.join(", ")}`
                : "No package tier linked"}
            </p>
          </article>
        ))}
        {!snapshot?.providers.length && <p className="text-sm text-slate-500">No providers have been added to the provider directory.</p>}
      </div>
      <p className="px-5 pb-5 text-xs leading-5 text-slate-500">Provider names come from the existing benefits provider directory. Package tiers remain unlinked until an actual provider plan is selected.</p>
    </section>}

    {activeTab === "employees" && <section role="tabpanel" id="hmo-panel-employees" aria-labelledby="hmo-tab-employees" className="overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-semibold text-slate-900">Employee eligibility & enrollment</h2><p className="mt-1 text-xs text-slate-500">Eligibility is evaluated from the current employee record. Package selection is entered by HR.</p></div>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(0); }}>
            <Input aria-label="Search HMO roster" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search employee or department" className="w-64" />
            <Button type="submit" variant="secondary" aria-label="Search"><Search /></Button>
          </form>
          <label className="flex items-center gap-2 rounded-lg border px-3 text-sm text-slate-700"><input type="checkbox" checked={eligibleOnly} onChange={(event) => { setEligibleOnly(event.target.checked); setPage(0); }} className="size-4 accent-indigo-600" />Eligible only</label>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Employee","Department","Eligibility","Assigned / recommended tier","Enrollment","Membership / dates",""].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody>
            {visibleEmployees.map((employee) => {
              const selectedPackage = snapshot?.packages.find((item) => item.id === employee.packageId);
              return <tr key={employee.id} className="border-t">
                <td className="px-4 py-3"><p className="font-medium text-slate-900">{employee.name}</p><p className="text-xs text-slate-500">{employee.employeeNumber} · {employee.currentMonthlySalary === null ? "No current salary" : `₱${employee.currentMonthlySalary.toLocaleString("en-PH")}/mo`}</p></td>
                <td className="px-4 py-3 text-slate-600">{employee.departmentName ?? "Unassigned"}</td>
                <td className="px-4 py-3"><StatusPill label={employee.eligible ? "Eligible" : "Not eligible"} positive={employee.eligible} /><p className="mt-1 text-xs text-slate-500">{employee.eligibilityReason}</p></td>
                <td className="px-4 py-3 text-slate-700">{selectedPackage?.tier ?? snapshot?.packages.find((item) => item.id === employee.recommendedPackageId)?.tier ?? "Not eligible"}</td>
                <td className="px-4 py-3">{employee.status ? <StatusPill label={statusLabel[employee.status]} positive={employee.status === "active"} /> : <span className="text-slate-400">Not recorded</span>}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{employee.membershipNumber || "No membership number"}<p className="mt-1">{employee.effectiveDate ?? "No start date"}{employee.expirationDate ? ` – ${employee.expirationDate}` : ""}</p></td>
                <td className="px-4 py-3"><Button variant="secondary" size="sm" disabled={!employee.eligible && !employee.enrollmentId} onClick={() => openEditor(employee)}>{employee.enrollmentId ? "Manage" : "Select package"}</Button></td>
              </tr>;
            })}
          </tbody>
        </table>
        {!visibleEmployees.length && <p className="px-6 py-12 text-center text-sm text-slate-500">No employees match this search.</p>}
      </div>
      <footer className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{employees.length} employees · Page {page + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page===0} onClick={()=>setPage((current)=>current-1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page+1>=pageCount} onClick={()=>setPage((current)=>current+1)}>Next</Button></div></footer>
    </section>}

    {editing && snapshot && <HmoEnrollmentEditor employee={editing} packages={snapshot.packages.filter((item) => item.active)} busy={busy} close={() => setEditing(null)} save={save} />}
  </main>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof UsersRound }) {
  return <article className="rounded-xl border bg-white p-4"><Icon className="size-4 text-indigo-600" /><p className="mt-3 text-2xl font-semibold tabular-nums text-slate-950">{value}</p><p className="mt-1 text-xs font-medium text-slate-700">{label}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>;
}

function StatusPill({ label, positive }: { label: string; positive: boolean }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{label}</span>;
}

function HmoEnrollmentEditor({ employee, packages, busy, close, save }: {
  employee: HmoEmployee;
  packages: HmoSnapshot["packages"];
  busy: boolean;
  close: () => void;
  save: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>({
    packageId: employee.recommendedPackageId ?? employee.packageId ?? packages[0]?.id ?? "",
    status: employee.status ?? "pending",
    membershipNumber: employee.membershipNumber ?? "",
    effectiveDate: employee.effectiveDate ?? "",
    expirationDate: employee.expirationDate ?? "",
    notes: employee.notes ?? "",
  });
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const active = values.status === "active";
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close(); }}><DialogContent className="max-w-xl">
    <DialogTitle>HMO details · {employee.name}</DialogTitle>
    <DialogDescription>{employee.eligibilityReason}. Assign the package selected by HR and record insurer-confirmed enrollment information.</DialogDescription>
    <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); save(values); }}>
      <label className="sm:col-span-2"><span className="text-sm font-medium text-slate-700">Salary-based package tier</span><select className="mt-1.5 h-10 w-full rounded-lg border bg-slate-50 px-3 text-sm" value={values.packageId} onChange={(event) => set("packageId", event.target.value)} disabled={employee.eligible} required>{packages.map((item) => <option key={item.id} value={item.id}>{item.tier}</option>)}</select><span className="mt-1 block text-xs text-slate-500">Determined automatically from current monthly salary. Update the salary band or employee compensation to change tier qualification.</span></label>
      <label><span className="text-sm font-medium text-slate-700">Enrollment status</span><select className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={values.status} onChange={(event) => set("status", event.target.value as FormValues["status"])}>{(["pending", "active", "waived", "terminated"] as const).map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
      <label><span className="text-sm font-medium text-slate-700">Membership number</span><Input className="mt-1.5" maxLength={100} value={values.membershipNumber} onChange={(event) => set("membershipNumber", event.target.value)} /></label>
      <label><span className="text-sm font-medium text-slate-700">Coverage effective date{active ? " *" : ""}</span><Input className="mt-1.5" type="date" required={active} value={values.effectiveDate} onChange={(event) => set("effectiveDate", event.target.value)} /></label>
      <label><span className="text-sm font-medium text-slate-700">Coverage end date</span><Input className="mt-1.5" type="date" value={values.expirationDate} onChange={(event) => set("expirationDate", event.target.value)} /></label>
      <label className="sm:col-span-2"><span className="text-sm font-medium text-slate-700">Notes</span><textarea className="mt-1.5 w-full rounded-lg border p-3 text-sm" rows={3} maxLength={2000} value={values.notes} onChange={(event) => set("notes", event.target.value)} /></label>
      <div className="sm:col-span-2 flex justify-end gap-2 border-t pt-4"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy || !values.packageId}>{busy && <LoaderCircle className="animate-spin" />}Save enrollment</Button></div>
    </form>
  </DialogContent></Dialog>;
}
