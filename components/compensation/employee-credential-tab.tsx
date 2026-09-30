"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveEmployeeCredential, type CompensationPlanningSnapshot } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RecordPageAccess } from "@/components/records/record-page";

type Props = RecordPageAccess & { snapshot: CompensationPlanningSnapshot | null };
const noEmployees: CompensationPlanningSnapshot["employees"] = [];

export function EmployeeCredentialTab({ roles, configured, snapshot, setupError }: Props) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const employees = snapshot?.employees ?? noEmployees;
  const [department, setDepartment] = useState("");
  const departmentOptions = useMemo(
    () => [...new Set(employees.map((employee) => employee.department ?? "Unassigned"))].sort((a, b) => a.localeCompare(b)),
    [employees],
  );
  const matchingEmployees = employees.filter((employee) =>
    (employee.department ?? "Unassigned") === department,
  );
  const canManageCredentials = configured && roles.some((role) =>
    ["super_admin", "hr_admin", "hr_manager"].includes(role),
  );
  async function addCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await saveEmployeeCredential({
      employeeId: String(formData.get("employeeId") ?? ""),
      credentialName: String(formData.get("credentialName") ?? ""),
      issuingOrganization: String(formData.get("issuingOrganization") ?? "").trim() || null,
      earnedOn: String(formData.get("earnedOn") ?? "") || null,
      expiresOn: String(formData.get("expiresOn") ?? "") || null,
      verificationStatus: String(formData.get("verificationStatus") ?? "pending"),
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    if (!result.ok) {
      toast.error("Credential was not saved", { description: result.message });
      return;
    }
    toast.success("Credential recorded", { description: "The employee credential was added to the HR record." });
    form.reset();
    setDepartment("");
    startSaving(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      {setupError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{setupError}</p>}
      {!snapshot && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Employee credential data is not available. Check the database connection and migrations.</p>}
      <form onSubmit={addCredential} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4 border-b pb-3 mb-2">
          <h2 className="text-lg font-semibold text-slate-900">Record Employee Credential</h2>
          <p className="text-sm text-slate-500">Log an earned credential or qualification for an employee.</p>
        </div>
        <label className="text-sm font-medium text-slate-700">Department
          <select required value={department} onChange={(event) => setDepartment(event.target.value)} disabled={!canManageCredentials || saving} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="">Select department</option>
            {departmentOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Employee
          <select name="employeeId" required disabled={!canManageCredentials || saving || !department} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="">Select employee</option>
            {matchingEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeNumber}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Credential / qualification
          <Input name="credentialName" required minLength={2} maxLength={160} disabled={!canManageCredentials || saving} className="mt-1.5" placeholder="e.g. Forklift Operator Certificate" />
        </label>
        <label className="text-sm font-medium text-slate-700">Issuing organization
          <Input name="issuingOrganization" maxLength={160} disabled={!canManageCredentials || saving} className="mt-1.5" />
        </label>
        <label className="text-sm font-medium text-slate-700">Verification
          <select name="verificationStatus" required disabled={!canManageCredentials || saving} defaultValue="pending" className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="pending">Pending review</option><option value="verified">Verified</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Date earned<Input name="earnedOn" type="date" disabled={!canManageCredentials || saving} className="mt-1.5" /></label>
        <label className="text-sm font-medium text-slate-700">Expiry date<Input name="expiresOn" type="date" disabled={!canManageCredentials || saving} className="mt-1.5" /></label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes<Input name="notes" maxLength={1000} disabled={!canManageCredentials || saving} className="mt-1.5" placeholder="Optional review notes" /></label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4 pt-2">
          <Button type="submit" disabled={!canManageCredentials || saving || !employees.length}>{saving ? "Saving…" : "Save credential"}</Button>
        </div>
        {configured && !canManageCredentials && <p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-4">Read-only access. HR administrators can record employee credentials.</p>}
        {!employees.length && snapshot && <p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-4">No active employees are available for credential entry.</p>}
        {department && !matchingEmployees.length && employees.length > 0 && <p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-4">No employees are available in this department.</p>}
      </form>
      <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">
        Already recorded credentials and whether they match the employee’s required or preferred position criteria are shown with the eye action in Salary Planning.
      </p>
    </div>
  );
}
