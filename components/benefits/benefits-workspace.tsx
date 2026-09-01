"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { BadgeCheck, CalendarClock, ChevronDown, CircleAlert, FileClock, HeartPulse, Landmark, MoreHorizontal, ShieldCheck, Umbrella, UsersRound, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { benefitRecords as initialRecords } from "@/lib/data/operations-sample";
import { formatCurrency } from "@/lib/utils";
import { CompactMetric, EmployeeCell, OperationsPageHeader, RecordToolbar, SyncButton, TableStatus } from "@/components/shared/operations-ui";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ExportRecord } from "@/types/operations";

const exportColumns = [
  { key: "id", label: "Benefit ID", width: 16 }, { key: "employeeId", label: "Employee ID", width: 16 }, { key: "employee", label: "Employee", width: 24 },
  { key: "benefitType", label: "Benefit Type", width: 18 }, { key: "provider", label: "Provider", width: 22 }, { key: "plan", label: "Plan", width: 26 },
  { key: "employeeCost", label: "Employee Cost", width: 18, format: "currency" as const }, { key: "employerCost", label: "Employer Cost", width: 18, format: "currency" as const },
  { key: "effectiveDate", label: "Effective Date", width: 16, format: "date" as const }, { key: "eligibility", label: "Eligibility", width: 18 }, { key: "payrollStatus", label: "Payroll Status", width: 18 },
];

export function BenefitsWorkspace() {
  const [records, setRecords] = useState(initialRecords);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [tab, setTab] = useState("employee");
  const filtered = useMemo(() => records.filter((record) => (!search || `${record.employee} ${record.employeeId} ${record.provider} ${record.plan}`.toLowerCase().includes(search.toLowerCase())) && (type === "all" || record.benefitType === type)), [records, search, type]);
  const exports: ExportRecord[] = filtered.map((record) => ({ ...record }));
  const totalCost = records.reduce((sum, record) => sum + record.employerCost, 0);

  function applyPending() {
    const count = records.filter((record) => record.payrollStatus === "pending" && record.eligibility === "eligible").length;
    setRecords((current) => current.map((record) => record.payrollStatus === "pending" && record.eligibility === "eligible" ? { ...record, payrollStatus: "applied" as const } : record));
    toast.success("Approved benefits applied to payroll", { description: `${count} eligible benefit records were added to the next payroll draft.` });
  }

  return (
    <div>
      <OperationsPageHeader eyebrow="Benefits Management" title="Benefits Management" description="Administer HMO, allowances, insurance, leave, and government-mandated benefits from eligibility through payroll application." actions={<><SyncButton label="Retrieve ESS requests" /><Button onClick={applyPending}><WalletCards />Apply to payroll</Button></>} />
      <section className="mt-6 grid overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:grid-cols-2 xl:grid-cols-5"><CompactMetric label="Enrolled employees" value="231" helper="93.1% of active employees" icon={UsersRound} tone="success" /><CompactMetric label="Active HMO plans" value="4" helper="2 providers" icon={HeartPulse} /><CompactMetric label="Insurance coverage" value="218" helper="₱524M total coverage" icon={ShieldCheck} /><CompactMetric label="Pending eligibility" value="7" helper="3 missing documents" icon={CircleAlert} tone="warning" /><CompactMetric label="Monthly employer cost" value={formatCurrency(totalCost * 46)} helper="Benefits and allowances" icon={Umbrella} /></section>

      <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex gap-6 overflow-x-auto border-b px-4" role="tablist">{[{ key: "employee", label: "Employee benefits" }, { key: "hmo", label: "HMO & health" }, { key: "allowances", label: "Allowances" }, { key: "insurance", label: "Insurance" }, { key: "leave", label: "Leave benefits" }, { key: "government", label: "Government benefits" }, { key: "history", label: "Benefit history" }].map((item) => <button onClick={() => { setTab(item.key); if (item.key === "hmo") setType("HMO"); else if (item.key === "allowances") setType("Allowance"); else if (item.key === "insurance") setType("Insurance"); else if (item.key === "leave") setType("Leave"); else if (item.key === "government") setType("Government"); else setType("all"); }} key={item.key} className={`relative h-12 shrink-0 text-sm font-medium ${tab === item.key ? "text-indigo-700 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-indigo-600" : "text-slate-500 hover:text-slate-800"}`}>{item.label}</button>)}</div>
        <RecordToolbar search={search} onSearch={setSearch} placeholder="Search employees, plans, or providers…" columns={exportColumns} records={exports} fileName="employee-benefits-2026-08" sheetName="Employee Benefits"><div className="relative"><select value={type} onChange={(event) => setType(event.target.value)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm"><option value="all">All benefit types</option><option value="HMO">HMO</option><option value="Allowance">Allowance</option><option value="Insurance">Insurance</option><option value="Leave">Leave</option><option value="Government">Government</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div><Button variant="secondary"><CalendarClock />Effective Aug–Sep</Button></RecordToolbar>
        <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-left text-sm"><thead className="bg-slate-50/80 text-xs text-slate-500"><tr>{["Employee", "Benefit", "Provider & plan", "Employee cost", "Employer cost", "Effective date", "Eligibility", "Payroll", ""].map((label) => <th className="h-11 border-b px-4 font-medium" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map((record) => <tr key={record.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"><td className="h-[68px] px-4"><EmployeeCell name={record.employee} initials={record.initials} secondary={record.employeeId} /></td><td className="px-4"><TableStatus label={record.benefitType} tone={record.benefitType === "HMO" ? "indigo" : record.benefitType === "Government" ? "green" : "blue"} /></td><td className="px-4"><p className="font-medium text-slate-700">{record.plan}</p><p className="mt-0.5 text-xs text-slate-400">{record.provider}</p></td><td className="whitespace-nowrap px-4 tabular-nums text-slate-600">{formatCurrency(record.employeeCost)}</td><td className="whitespace-nowrap px-4 font-medium tabular-nums text-slate-800">{formatCurrency(record.employerCost)}</td><td className="whitespace-nowrap px-4 text-slate-600">{format(parseISO(record.effectiveDate), "MMM d, yyyy")}</td><td className="px-4"><TableStatus label={record.eligibility === "eligible" ? "Eligible" : record.eligibility === "pending_documents" ? "Pending documents" : "Not eligible"} tone={record.eligibility === "eligible" ? "green" : record.eligibility === "pending_documents" ? "amber" : "red"} /></td><td className="px-4"><TableStatus label={record.payrollStatus === "applied" ? "Applied" : record.payrollStatus === "pending" ? "Pending" : "N/A"} tone={record.payrollStatus === "applied" ? "green" : record.payrollStatus === "pending" ? "amber" : "slate"} /></td><td className="px-4"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => toast.info(`${record.employee} benefit details opened`)}><HeartPulse />View coverage</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.info("Eligibility rules checked")}><BadgeCheck />Check eligibility</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.info("Benefit history opened")}><FileClock />View history</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => toast.success("Benefit queued for payroll") }><Landmark />Apply to payroll</DropdownMenuItem></DropdownMenuContent></DropdownMenu></td></tr>)}</tbody></table></div>
        <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>Showing {filtered.length} benefit records · Approved ESS requests are retrieved during synchronization</span><span>Eligibility is revalidated before payroll application</span></div>
      </section>
    </div>
  );
}
