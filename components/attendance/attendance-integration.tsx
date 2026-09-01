"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Activity, CalendarDays, Check, ChevronDown, CircleAlert, Clock3, DatabaseZap, Fingerprint, History, MoreHorizontal, Server, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { attendanceRecords } from "@/lib/data/operations-sample";
import { samplePayrollEmployees } from "@/lib/data/payroll-sample";
import { formatCurrency } from "@/lib/utils";
import { CompactMetric, EmployeeCell, OperationsPageHeader, RecordToolbar, SyncButton, TableStatus } from "@/components/shared/operations-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ExportRecord } from "@/types/operations";

const exportColumns = [
  { key: "employeeId", label: "Employee ID", width: 16 }, { key: "employee", label: "Employee", width: 24 },
  { key: "department", label: "Department", width: 22 }, { key: "date", label: "Date", width: 15, format: "date" as const },
  { key: "timeIn", label: "Time In", width: 12 }, { key: "timeOut", label: "Time Out", width: 12 },
  { key: "workedHours", label: "Worked Hours", width: 15, format: "number" as const }, { key: "lateMinutes", label: "Late Minutes", width: 14, format: "number" as const },
  { key: "overtimeHours", label: "Overtime Hours", width: 16, format: "number" as const }, { key: "classification", label: "Classification", width: 16 }, { key: "syncStatus", label: "Sync Status", width: 14 },
];
const employeeExportColumns = [{ key: "employeeId", label: "Employee ID", width: 16 }, { key: "employee", label: "Employee", width: 24 }, { key: "department", label: "Department", width: 22 }, { key: "jobTitle", label: "Job Title", width: 24 }, { key: "employmentStatus", label: "Status", width: 14 }, { key: "lastSync", label: "Last ESS Sync", width: 20 }];
const salaryExportColumns = [{ key: "employeeId", label: "Employee ID", width: 16 }, { key: "employee", label: "Employee", width: 24 }, { key: "department", label: "Department", width: 22 }, { key: "monthlySalary", label: "Monthly Salary", width: 18, format: "currency" as const }, { key: "allowances", label: "Monthly Allowances", width: 20, format: "currency" as const }, { key: "effectiveDate", label: "Effective Date", width: 16, format: "date" as const }, { key: "syncStatus", label: "Sync Status", width: 14 }];

const classificationLabels = { on_time: "On time", late: "Late", absent: "Absent", overtime: "Overtime", on_leave: "On leave" };
const classificationTones = { on_time: "green", late: "amber", absent: "red", overtime: "indigo", on_leave: "blue" } as const;

export function AttendanceIntegration() {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("all");
  const [activeTab, setActiveTab] = useState("attendance");
  const [lastSync, setLastSync] = useState("Today, 2:42 PM");

  const records = useMemo(() => attendanceRecords.filter((record) => {
    const query = search.toLowerCase();
    return (!query || `${record.employee} ${record.employeeId} ${record.department}`.toLowerCase().includes(query)) && (classification === "all" || record.classification === classification);
  }), [classification, search]);

  const exports: ExportRecord[] = records.map((record) => ({ ...record, timeIn: record.timeIn ?? "—", timeOut: record.timeOut ?? "—" }));
  const employeeExports: ExportRecord[] = samplePayrollEmployees.filter((employee) => !search || `${employee.name} ${employee.employeeId} ${employee.department}`.toLowerCase().includes(search.toLowerCase())).map((employee, index) => ({ employeeId: employee.employeeId, employee: employee.name, department: employee.department, jobTitle: ["Senior Product Designer", "Staff Software Engineer", "People Operations Partner", "Account Executive", "Finance Analyst", "Customer Success Manager"][index], employmentStatus: "Active", lastSync: "Aug 30, 2026 2:42 PM" }));
  const salaryExports: ExportRecord[] = samplePayrollEmployees.filter((employee) => !search || `${employee.name} ${employee.employeeId} ${employee.department}`.toLowerCase().includes(search.toLowerCase())).map((employee) => ({ employeeId: employee.employeeId, employee: employee.name, department: employee.department, monthlySalary: employee.basicSalary * 2, allowances: employee.allowances * 2, effectiveDate: "2026-08-01", syncStatus: "Synced" }));
  const activeColumns = activeTab === "attendance" ? exportColumns : activeTab === "employees" ? employeeExportColumns : salaryExportColumns;
  const activeExports = activeTab === "attendance" ? exports : activeTab === "employees" ? employeeExports : salaryExports;
  const lateCount = attendanceRecords.filter((record) => record.classification === "late").length;
  const overtime = attendanceRecords.reduce((sum, record) => sum + record.overtimeHours, 0);

  return (
    <div>
      <OperationsPageHeader eyebrow="Employee & Attendance" title="Employee & Attendance Integration" description="Retrieve and synchronize employee profiles, compensation data, and time records from the Employee Self-Service system." actions={<><Button variant="secondary" onClick={() => toast.info("Sync history opened in demo mode")}><History />Sync history</Button><SyncButton onSynced={() => setLastSync("Just now")} /></>} />

      <section className="mt-6 grid overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:grid-cols-2 xl:grid-cols-5">
        <CompactMetric label="Employee records" value="248" helper="247 active · 1 on leave" icon={UsersRound} />
        <CompactMetric label="Attendance today" value="242" helper="97.6% reporting rate" icon={Fingerprint} tone="success" />
        <CompactMetric label="Late arrivals" value={String(lateCount)} helper="50 minutes total" icon={Clock3} tone="warning" />
        <CompactMetric label="Overtime logged" value={`${overtime.toFixed(1)} hrs`} helper="Pending payroll review" icon={Activity} />
        <CompactMetric label="Sync exceptions" value="1" helper="Time record conflict" icon={CircleAlert} tone="danger" />
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="grid gap-px bg-slate-200 lg:grid-cols-4">
          {[
            { title: "Employee profiles", detail: "248 of 248 synchronized", icon: UsersRound, status: "Complete" },
            { title: "Attendance records", detail: "Last 30 days retrieved", icon: Fingerprint, status: "Complete" },
            { title: "Salary & compensation", detail: "Effective records synchronized", icon: DatabaseZap, status: "Complete" },
            { title: "ESS connection", detail: `Last sync ${lastSync}`, icon: Server, status: "Healthy" },
          ].map((item) => { const Icon = item.icon; return <div className="flex items-center gap-3 bg-white p-4" key={item.title}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{item.title}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</p></div><span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600"><Check className="size-3" />{item.status}</span></div>; })}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex gap-6 overflow-x-auto border-b border-slate-200 px-4" role="tablist">
          {[{ key: "attendance", label: "Attendance records" }, { key: "employees", label: "Employee records" }, { key: "compensation", label: "Salary synchronization" }].map((tab) => <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`relative h-12 shrink-0 text-sm font-medium ${activeTab === tab.key ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{tab.label}</button>)}
        </div>
        <RecordToolbar search={search} onSearch={setSearch} placeholder="Search employees or records…" columns={activeColumns} records={activeExports} fileName={`${activeTab}-records-${format(new Date(), "yyyy-MM-dd")}`} sheetName={activeTab === "attendance" ? "Attendance Records" : activeTab === "employees" ? "Employee Records" : "Salary Synchronization"}>
          {activeTab === "attendance" && <div className="relative"><select value={classification} onChange={(event) => setClassification(event.target.value)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm"><option value="all">All classifications</option><option value="on_time">On time</option><option value="late">Late</option><option value="absent">Absent</option><option value="overtime">Overtime</option><option value="on_leave">On leave</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div>}
          <Button variant="secondary"><CalendarDays />Aug 1–30, 2026</Button>
        </RecordToolbar>
        {activeTab === "attendance" ? <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr>{["Employee", "Date", "Time in", "Time out", "Worked", "Late", "Overtime", "Classification", "ESS sync", ""].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>
            {records.map((record) => <tr key={record.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="h-[68px] px-4"><EmployeeCell name={record.employee} initials={record.initials} secondary={`${record.employeeId} · ${record.department}`} /></td><td className="whitespace-nowrap px-4 text-slate-600">{format(parseISO(record.date), "MMM d, yyyy")}</td><td className="px-4 font-medium tabular-nums text-slate-700">{record.timeIn ?? "—"}</td><td className="px-4 font-medium tabular-nums text-slate-700">{record.timeOut ?? "—"}</td><td className="px-4 tabular-nums text-slate-600">{record.workedHours ? `${record.workedHours.toFixed(2)}h` : "—"}</td><td className="px-4 tabular-nums text-slate-600">{record.lateMinutes ? `${record.lateMinutes}m` : "—"}</td><td className="px-4 tabular-nums text-slate-600">{record.overtimeHours ? `${record.overtimeHours.toFixed(2)}h` : "—"}</td><td className="px-4"><TableStatus label={classificationLabels[record.classification]} tone={classificationTones[record.classification]} /></td><td className="px-4"><TableStatus label={record.syncStatus === "synced" ? "Synced" : record.syncStatus === "pending" ? "Pending" : "Conflict"} tone={record.syncStatus === "synced" ? "green" : record.syncStatus === "pending" ? "slate" : "red"} /></td><td className="px-4"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => toast.info(`Opening ${record.employee} attendance record`)}>View record</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.success("Record queued for resynchronization")}>Resync record</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => toast.info("Audit history opened")}>View audit history</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}
          </tbody></table>
        </div> : activeTab === "employees" ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr>{["Employee", "Department", "Job title", "Employment status", "Last ESS sync", "Record state"].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{employeeExports.map((employee, index) => <tr key={String(employee.employeeId)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="h-[68px] px-4"><EmployeeCell name={String(employee.employee)} initials={samplePayrollEmployees[index]?.initials ?? "EM"} secondary={String(employee.employeeId)} /></td><td className="px-4 text-slate-600">{String(employee.department)}</td><td className="px-4 text-slate-600">{String(employee.jobTitle)}</td><td className="px-4"><TableStatus label="Active" tone="green" /></td><td className="px-4 text-xs text-slate-500">{String(employee.lastSync)}</td><td className="px-4"><TableStatus label="Synchronized" tone="green" /></td></tr>)}</tbody></table></div> : <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr>{["Employee", "Department", "Monthly salary", "Allowances", "Effective date", "ESS sync"].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{salaryExports.map((salary, index) => <tr key={String(salary.employeeId)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="h-[68px] px-4"><EmployeeCell name={String(salary.employee)} initials={samplePayrollEmployees[index]?.initials ?? "EM"} secondary={String(salary.employeeId)} /></td><td className="px-4 text-slate-600">{String(salary.department)}</td><td className="px-4 font-medium tabular-nums text-slate-900">{formatCurrency(Number(salary.monthlySalary))}</td><td className="px-4 tabular-nums text-slate-600">{formatCurrency(Number(salary.allowances))}</td><td className="px-4 text-slate-600">Aug 1, 2026</td><td className="px-4"><TableStatus label="Synced" tone="green" /></td></tr>)}</tbody></table></div>}
        <div className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Showing {activeExports.length} records · Source: ESS employee, compensation, and attendance APIs</span><span>Records are validated before payroll calculations</span></div>
      </section>
    </div>
  );
}
