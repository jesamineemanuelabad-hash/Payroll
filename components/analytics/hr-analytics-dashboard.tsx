"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  BriefcaseBusiness, Building2, CalendarDays, ChevronDown,
  Clock3, HeartPulse, LockKeyhole, MapPin, RefreshCw, UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { loadHrAnalytics, lockHrAnalytics, unlockHrAnalytics } from "@/app/actions/hr-analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HrAnalyticsFilters, HrAnalyticsSnapshot } from "@/lib/dashboard/hr-schema";
import { cn } from "@/lib/utils";

const classLabels: Record<string, { label: string; color: string }> = {
  on_time: { label: "On time", color: "#10b981" },
  late: { label: "Late", color: "#f59e0b" },
  absent: { label: "Absent", color: "#ef4444" },
  overtime: { label: "Overtime", color: "#6366f1" },
  on_leave: { label: "On leave", color: "#94a3b8" },
};

const pretty = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const integer = (value: number) => value.toLocaleString();
const days = (value: number) => Number.isInteger(value) ? integer(value) : value.toLocaleString(undefined, { maximumFractionDigits: 1 });

function Filter({ label, icon: Icon, value, onChange, children }: {
  label: string;
  icon: typeof CalendarDays;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return <label className="min-w-[156px] flex-1 lg:flex-none">
    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</span>
    <span className="relative block">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
    </span>
  </label>;
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
    {children}
  </section>;
}

function Metric({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof UsersRound }) {
  return <div className="min-w-0 border-r border-slate-200 p-5 last:border-r-0">
    <div className="flex items-center justify-between gap-2">
      <p className="truncate text-xs font-medium text-slate-500">{label}</p>
      <span className="grid size-8 place-items-center rounded-lg bg-slate-50 text-slate-500"><Icon className="size-4" /></span>
    </div>
    <p className="mt-2 truncate text-xl font-semibold tracking-[-0.025em] text-slate-950">{value}</p>
    <p className="mt-1.5 truncate text-xs text-slate-500">{helper}</p>
  </div>;
}

function Empty({ message }: { message: string }) {
  return <div className="grid min-h-40 place-items-center rounded-lg bg-slate-50 px-5 text-center text-xs leading-5 text-slate-500">{message}</div>;
}

function CountBars({ items, nameKey, total, color = "bg-indigo-500" }: {
  items: Array<{ count: number; [key: string]: string | number }>;
  nameKey: string;
  total?: number;
  color?: string;
}) {
  if (!items.length || items.every((item) => item.count === 0)) return <Empty message="No records are available for this selection." />;
  const maximum = Math.max(...items.map((item) => item.count), 1);
  return <div className="space-y-4">
    {items.map((item) => {
      const label = String(item[nameKey]);
      const share = total ? `${(item.count / total * 100).toFixed(0)}%` : integer(item.count);
      return <div className="grid grid-cols-[minmax(90px,0.85fr)_minmax(80px,2fr)_58px] items-center gap-3" key={label}>
        <span className="truncate text-xs font-medium text-slate-600">{label}</span>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${item.count / maximum * 100}%` }} />
        </div>
        <span className="text-right text-xs font-semibold tabular-nums text-slate-700">{share}</span>
      </div>;
    })}
  </div>;
}

function HiringTrend({ data }: { data: HrAnalyticsSnapshot["hiringTrend"] }) {
  const maximum = Math.max(...data.map((item) => item.count), 1);
  if (!data.length || data.every((item) => item.count === 0)) return <Empty message="No hire dates fall within the selected period." />;
  return <div className="flex h-52 items-end gap-2 border-b border-slate-200 px-1 sm:gap-3">
    {data.map((item) => <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.month}>
      <span className="mb-1 text-[10px] font-medium tabular-nums text-slate-500">{item.count || ""}</span>
      <div className="w-full max-w-10 rounded-t bg-indigo-500 transition-[height]" style={{ height: `${Math.max(item.count ? 8 : 0, item.count / maximum * 145)}px` }} />
      <span className="mb-[-20px] mt-2 text-[9px] text-slate-400">{item.label}</span>
    </div>)}
  </div>;
}

function AttendanceMix({ data }: { data: HrAnalyticsSnapshot["attendance"] }) {
  const classes = data.classes.map((item) => ({
    ...item,
    ...classLabels[item.classification] ?? { label: pretty(item.classification), color: "#64748b" },
  }));
  if (!data.total) return <Empty message="Attendance patterns appear when time records are available for this period." />;
  return <div>
    <div className="flex h-9 overflow-hidden rounded-lg bg-slate-100" aria-label={`${integer(data.total)} attendance records`}>
      {classes.filter((item) => item.count > 0).map((item) => <div key={item.classification} style={{ width: `${item.count / data.total * 100}%`, backgroundColor: item.color }} title={`${item.label}: ${integer(item.count)}`} />)}
    </div>
    <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
      {classes.map((item) => <div className="flex items-center gap-2" key={item.classification}>
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{item.label}</span>
        <span className="text-xs font-semibold tabular-nums text-slate-800">{integer(item.count)}</span>
      </div>)}
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
      <div><p className="text-[11px] text-slate-500">Late time recorded</p><p className="mt-1 text-sm font-semibold text-slate-800">{days(data.lateMinutes / 60)} hrs</p></div>
      <div><p className="text-[11px] text-slate-500">Absence time recorded</p><p className="mt-1 text-sm font-semibold text-slate-800">{days(data.absenceMinutes / 60)} hrs</p></div>
    </div>
  </div>;
}

function LeaveByType({ data }: { data: HrAnalyticsSnapshot["leave"]["byType"] }) {
  const maximum = Math.max(...data.flatMap((item) => [item.approvedDays, item.submittedDays]), 0);
  if (!maximum) return <Empty message="No submitted or approved leave days are recorded for this period." />;
  return <div>
    <div className="mb-3 flex gap-4 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />Approved</span>
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" />Pending</span>
    </div>
    <div className="space-y-4">
      {data.filter((item) => item.approvedDays || item.submittedDays).map((item) => <div className="grid grid-cols-[90px_minmax(80px,1fr)_96px] items-center gap-3" key={item.type}>
        <span className="truncate text-xs font-medium text-slate-600">{pretty(item.type)}</span>
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.approvedDays / maximum * 100}%` }} /></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${item.submittedDays / maximum * 100}%` }} /></div>
        </div>
        <span className="text-right text-[10px] tabular-nums text-slate-500">{days(item.approvedDays)} / {days(item.submittedDays)} d</span>
      </div>)}
    </div>
  </div>;
}

export function HrAnalyticsDashboard() {
  const [data, setData] = useState<HrAnalyticsSnapshot | null>(null);
  const [filters, setFilters] = useState<HrAnalyticsFilters>({ months: 12, departmentId: null, location: null, employmentType: null });
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [accessExpiresAt, setAccessExpiresAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);

  useEffect(() => {
    if (!data || !accessExpiresAt) return;
    const timer = window.setTimeout(() => {
      setData(null);
      setAccessExpiresAt(null);
      setPassword("");
      setError("Your access expired. Enter your account password to continue.");
      void lockHrAnalytics().then((result) => {
        if (!result.ok) setError(result.message);
      });
    }, Math.max(0, accessExpiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [accessExpiresAt, data]);

  useEffect(() => () => {
    void lockHrAnalytics();
  }, []);

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const access = await unlockHrAnalytics(password);
      setPassword("");
      if (!access.ok) {
        setError(access.message);
        return;
      }
      setAccessExpiresAt(access.expiresAt);
      const result = await loadHrAnalytics(filters);
      if (!result.ok) {
        await lockHrAnalytics();
        setAccessExpiresAt(null);
        setError(result.message);
        return;
      }
      setData(result.data);
    });
  }

  function lockModule() {
    startTransition(async () => {
      const result = await lockHrAnalytics();
      if (!result.ok) {
        setError(result.message);
        toast.error("HR Analytics could not be locked", { description: result.message });
        return;
      }
      requestId.current += 1;
      setData(null);
      setAccessExpiresAt(null);
      setPassword("");
      setError("");
    });
  }

  function update(next: HrAnalyticsFilters, notify = false) {
    const id = ++requestId.current;
    setFilters(next);
    setError("");
    startTransition(async () => {
      const result = await loadHrAnalytics(next);
      if (id !== requestId.current) return;
      if (!result.ok) {
        if (result.message.includes("password verification") || result.message.includes("Enter your password")) setData(null);
        setError(result.message);
        toast.error("HR analytics refresh failed", { description: result.message });
        return;
      }
      setData(result.data);
      if (notify) toast.success("HR analytics refreshed");
    });
  }

  if (!data) return <div className="mx-auto max-w-lg py-10">
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
      <span>Payroll &amp; Benefits</span><span className="text-slate-300">/</span><span className="text-slate-700">HR Analytics</span>
    </nav>
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><LockKeyhole className="size-5" /></span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">Verify your password</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Enter your account password to open HR Analytics. Access is limited to this signed-in session and expires after 15 minutes.</p>
      <form className="mt-6 space-y-4" onSubmit={submitPassword}>
        <label className="block text-sm font-medium text-slate-700" htmlFor="hr-analytics-password">Account password</label>
        <Input
          id="hr-analytics-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          maxLength={128}
          disabled={pending}
        />
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Button className="w-full" type="submit" disabled={pending || !password}>
          <LockKeyhole className={pending ? "animate-pulse" : ""} />{pending ? "Verifying…" : "Unlock HR Analytics"}
        </Button>
      </form>
    </section>
  </div>;

  const coverage = data.summary.headcount
    ? Math.round(data.summary.activeBenefits / data.summary.headcount * 100)
    : 0;

  return <div aria-busy={pending}>
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
      <span>Payroll &amp; Benefits</span><span className="text-slate-300">/</span><span className="text-slate-700">HR Analytics</span>
    </nav>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">HR Analytics</h1>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Workforce</span>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Understand workforce composition, hiring, tenure, attendance, leave, and compensation patterns.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => update(filters, true)} disabled={pending}>
          <RefreshCw className={pending ? "animate-spin" : ""} />{pending ? "Refreshing…" : "Refresh data"}
        </Button>
        <Button variant="secondary" onClick={lockModule} disabled={pending}><LockKeyhole />Lock</Button>
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <section aria-label="HR analytics filters" className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Filter label="Period" icon={CalendarDays} value={String(filters.months)} onChange={(value) => update({ ...filters, months: Number(value) as 3 | 6 | 12 })}>
          <option value="12">Last 12 months</option><option value="6">Last 6 months</option><option value="3">Last 3 months</option>
        </Filter>
        <Filter label="Department" icon={Building2} value={filters.departmentId ?? ""} onChange={(value) => update({ ...filters, departmentId: value || null })}>
          <option value="">All departments</option>{data.options.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
        </Filter>
        <Filter label="Location" icon={MapPin} value={filters.location ?? ""} onChange={(value) => update({ ...filters, location: value || null })}>
          <option value="">All locations</option>{data.options.locations.map((item) => <option value={item} key={item}>{item}</option>)}
        </Filter>
        <Filter label="Employment type" icon={BriefcaseBusiness} value={filters.employmentType ?? ""} onChange={(value) => update({ ...filters, employmentType: value || null })}>
          <option value="">All employees</option>{data.options.employmentTypes.map((item) => <option value={item} key={item}>{pretty(item)}</option>)}
        </Filter>
      </div>
    </section>

    <section aria-label="Workforce summary" className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Current headcount" value={integer(data.summary.headcount)} helper={`${integer(data.summary.activeEmployees)} active · ${integer(data.summary.employeesOnLeave)} on leave`} icon={UsersRound} />
      <Metric label="New hires" value={integer(data.summary.newHires)} helper={`Selected ${filters.months}-month period`} icon={BriefcaseBusiness} />
      <Metric label="Average tenure" value={data.summary.employeesWithHireDate ? `${(data.summary.averageTenureMonths / 12).toFixed(1)} yrs` : "—"} helper={`${integer(data.summary.employeesWithHireDate)} with hire dates`} icon={Clock3} />
      <Metric label="Benefit coverage" value={`${coverage}%`} helper={`${integer(data.summary.activeBenefits)} currently enrolled`} icon={HeartPulse} />
      <Metric label="Attendance records" value={integer(data.attendance.total)} helper={`Selected ${filters.months}-month period`} icon={CalendarDays} />
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="Workforce by department" description="Current active and on-leave payroll employees">
        <CountBars items={data.headcountByDepartment} nameKey="name" total={data.summary.headcount} />
      </Panel>
      <Panel title="Employment type" description="Current workforce composition">
        <CountBars items={data.employmentMix} nameKey="type" total={data.summary.headcount} color="bg-sky-500" />
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="Hiring trend" description="Payroll employees recorded as hired by HR2, grouped by month">
        <HiringTrend data={data.hiringTrend} />
      </Panel>
      <Panel title="Workforce tenure" description={`Tenure distribution for employees with hire dates (${integer(data.summary.employeesWithHireDate)} records)`}>
        <CountBars items={data.tenureBands} nameKey="label" total={data.summary.employeesWithHireDate} color="bg-violet-500" />
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="Attendance patterns" description="Classification of saved attendance records in the selected period">
        <AttendanceMix data={data.attendance} />
      </Panel>
      <Panel title="Leave activity" description="Approved usage and submitted requests based on leave start date">
        <div className="mb-5 grid grid-cols-3 gap-3">
          {[["Pending", data.leave.submittedRequests], ["Approved", data.leave.approvedRequests], ["Rejected", data.leave.rejectedRequests]].map(([label, count]) => (
            <div className="rounded-lg bg-slate-50 p-3" key={String(label)}>
              <p className="text-[11px] text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{integer(Number(count))}</p>
            </div>
          ))}
        </div>
        <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <span className="text-slate-500"><strong className="text-slate-800">{days(data.leave.approvedDays)}</strong> approved days</span>
          <span className="text-slate-500"><strong className="text-slate-800">{days(data.leave.submittedDays)}</strong> pending days</span>
        </div>
        <LeaveByType data={data.leave.byType} />
      </Panel>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Panel title="Monthly base salary bands" description="Current base-pay distribution, converted to a monthly equivalent">
        <CountBars items={data.compensationBands} nameKey="label" color="bg-indigo-500" />
      </Panel>
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
        <h2 className="text-sm font-semibold text-slate-900">How to read this view</h2>
        <p className="mt-2 text-xs leading-5 text-slate-600">Headcount includes current active and on-leave payroll employees. Hiring uses HR2 hire dates; attendance and leave cover the selected period. Salary bands show aggregated base pay, not payroll totals.</p>
        <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">Turnover is not shown because employee records do not contain reliable separation dates. Compensation equity by demographic group is not inferred because those attributes are not part of the approved employee data.</p>
      </div>
    </div>
  </div>;
}
