"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, Banknote, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, ChevronRight, CircleAlert, FileCheck2,
  Fingerprint, HeartPulse, ReceiptText, RefreshCw, ShieldCheck, Sparkles,
  UsersRound, WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { loadLiveDashboard } from "@/app/actions/dashboard";
import { DownloadOverviewReport } from "@/components/overview/overview-actions";
import { PayrollStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import type { DashboardFilters, LiveDashboardData } from "@/lib/dashboard/schema";

type TrendMetric = "net" | "gross" | "benefits";
const trendMeta = {
  net: { label: "Net payroll", color: "#4f46e5" },
  gross: { label: "Gross payroll", color: "#0ea5e9" },
  benefits: { label: "Benefits", color: "#10b981" },
} satisfies Record<TrendMetric, { label: string; color: string }>;

function moneyCompact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value);
}

function relativeTime(value: string | null) {
  if (!value) return "No completed ESS sync";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function percentChange(values: number[]) {
  const present = values.at(-1) ?? 0;
  const prior = values.at(-2) ?? 0;
  if (!prior) return present ? "New" : "No change";
  const change = ((present - prior) / Math.abs(prior)) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const series = values.length ? values : [0];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const points = series.map((value, index) => {
    const x = series.length === 1 ? 39 : index * 78 / (series.length - 1);
    return `${x},${27 - ((value - min) / Math.max(max - min, 1)) * 22}`;
  }).join(" ");
  return <svg viewBox="0 0 78 30" className="h-8 w-[78px] overflow-visible" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chart-line-animate" /></svg>;
}

function KpiCard({ label, value, helper, trend, icon: Icon, chart, warning = false }: {
  label: string; value: string; helper: string; trend: string; icon: typeof UsersRound; chart: number[]; warning?: boolean;
}) {
  return (
    <div className="min-w-0 border-r border-slate-200 p-5 last:border-r-0">
      <div className="flex items-center gap-2"><span className={cn("grid size-8 place-items-center rounded-lg", warning ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600")}><Icon className="size-4" /></span><p className="truncate text-xs font-medium text-slate-500">{label}</p></div>
      <div className="mt-4 flex items-end justify-between gap-3"><div className="min-w-0"><p className="truncate text-2xl font-semibold tracking-[-0.03em] text-slate-950">{value}</p><div className="mt-1.5 flex items-center gap-1.5 text-xs"><span className={warning ? "font-medium text-amber-600" : "flex items-center font-medium text-emerald-600"}>{!warning && <ArrowUpRight className="mr-0.5 size-3" />}{trend}</span><span className="truncate text-slate-500">{helper}</span></div></div><Sparkline values={chart} color={warning ? "#f59e0b" : "#6366f1"} /></div>
    </div>
  );
}

function PerformanceChart({ data, metric, version }: { data: LiveDashboardData["trend"]; metric: TrendMetric; version: number }) {
  const values = data.map((item) => item[metric]);
  if (!data.length || values.every((value) => value === 0)) return <div className="grid h-[260px] place-items-center text-center text-sm text-slate-500">No payroll totals are available for this period.</div>;
  const width = 680; const left = 56; const right = 660; const top = 20; const bottom = 200;
  const min = Math.min(...values); const max = Math.max(...values); const padding = Math.max((max - min) * 0.12, max * 0.05, 1);
  const low = Math.max(0, min - padding); const high = max + padding;
  const x = (index: number) => left + index * (right - left) / Math.max(values.length - 1, 1);
  const y = (value: number) => bottom - ((value - low) / Math.max(high - low, 1)) * (bottom - top);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const color = trendMeta[metric].color;
  return <div key={version} className="mt-5 h-[260px] w-full"><svg viewBox={`0 0 ${width} 240`} className="h-full w-full overflow-visible" role="img" aria-label={`${trendMeta[metric].label} live trend`}>{[top,(top+bottom)/2,bottom].map((line,index) => <g key={line}><line x1={left} x2={right} y1={line} y2={line} stroke="#e8ebf0" strokeDasharray="3 4" /><text x="0" y={line+4} fill="#94a3b8" fontSize="10">{moneyCompact([high,(high+low)/2,low][index])}</text></g>)}<path d={`M ${points.replaceAll(" "," L ")} L ${right},${bottom} L ${left},${bottom} Z`} fill={color} fillOpacity="0.06" className="chart-area-animate" /><polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line-animate" />{data.map((item,index) => <g key={item.month}><circle cx={x(index)} cy={y(values[index])} r="3.5" fill="white" stroke={color} strokeWidth="2" className="chart-point-animate"><title>{item.label}: {formatCurrency(values[index])}</title></circle><text x={x(index)} y="226" textAnchor="middle" fill="#94a3b8" fontSize="10">{item.label}</text></g>)}</svg></div>;
}

const taskMeta = {
  payroll: { title: "Review payroll exceptions", href: "/payroll-benefits/payroll", icon: WalletCards, tone: "bg-amber-50 text-amber-600" },
  claims: { title: "Verify reimbursement claims", href: "/payroll-benefits/claims", icon: ReceiptText, tone: "bg-sky-50 text-sky-600" },
  benefits: { title: "Check benefit eligibility", href: "/payroll-benefits/benefits", icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-600" },
  attendance: { title: "Review attendance anomalies", href: "/payroll-benefits/analytics", icon: Fingerprint, tone: "bg-violet-50 text-violet-600" },
} as const;

const activityIcons: Record<string, typeof WalletCards> = { payroll_runs: WalletCards, payroll_items: Banknote, claims: ReceiptText, employee_benefits: HeartPulse, attendance_records: Fingerprint, compensation_reviews: BriefcaseBusiness, profiles: UsersRound };

export function OverviewDashboard({ initialData }: { initialData: LiveDashboardData }) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState<DashboardFilters>({ months: 12, departmentId: null, location: null, employmentType: null });
  const [metric, setMetric] = useState<TrendMetric>("net");
  const [activityTab, setActivityTab] = useState("all");
  const [animationKey, setAnimationKey] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const requestId = useRef(0);
  const activities = useMemo(() => data.activity.filter((item) => activityTab === "all" || item.entityType.includes(activityTab)), [activityTab, data.activity]);
  const trendValues = data.trend.map((item) => item[metric]);

  function update(next: DashboardFilters, successMessage?: string) {
    const id = ++requestId.current;
    setFilters(next);
    setError("");
    startTransition(async () => {
      const result = await loadLiveDashboard(next);
      if (id !== requestId.current) return;
      if (!result.ok) { setError(result.message); toast.error("Dashboard refresh failed", { description: result.message }); return; }
      setData(result.data);
      setAnimationKey((key) => key + 1);
      if (successMessage) toast.success(successMessage, { description: "The latest saved records are now displayed." });
    });
  }

  const readiness = data.readiness;
  const period = readiness ? `${readiness.periodStart} – ${readiness.periodEnd}` : "No payroll period";
  const stages: Array<{ label: string; value: number | string; helper: string; icon: typeof UsersRound; href: Route; complete: boolean }> = [
    { label: "Attendance", value: data.attendance.total, helper: "saved records", icon: Fingerprint, href: "/payroll-benefits/attendance", complete: data.attendance.total > 0 },
    { label: "Employees", value: data.summary.employeeCount, helper: "active workforce", icon: UsersRound, href: "/payroll-benefits/attendance", complete: data.summary.employeeCount > 0 },
    { label: "Calculated", value: readiness?.employeeCount ?? 0, helper: "payroll entries", icon: Banknote, href: "/payroll-benefits/payroll", complete: Boolean(readiness?.employeeCount) },
    { label: "Exceptions", value: readiness?.exceptions ?? 0, helper: "need review", icon: FileCheck2, href: "/payroll-benefits/payroll", complete: Boolean(readiness && readiness.exceptions === 0) },
    { label: "Payment", value: readiness?.payDate ?? "—", helper: readiness?.status.replaceAll("_", " ") ?? "not scheduled", icon: CalendarDays, href: readiness ? `/payroll-benefits/payroll/${readiness.id}` as Route : "/payroll-benefits/payroll", complete: readiness?.status === "paid" },
  ];

  return <div aria-busy={pending}>
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div><div className="flex items-center gap-2"><span className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />Live Supabase data</span><span className="text-xs text-slate-400">ESS sync: {relativeTime(data.lastSyncAt)}</span></div><div className="mt-3 flex items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-[30px]">People operations overview</h1><Sparkles className="size-5 text-amber-500" /></div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Live workforce, payroll, benefits, attendance, and approval records in one command center.</p></div><div className="flex flex-wrap items-center gap-2"><DownloadOverviewReport data={data} /><Button variant="secondary" onClick={() => update(filters,"Dashboard refreshed")} disabled={pending}><RefreshCw className={pending ? "animate-spin" : ""} />{pending ? "Refreshing…" : "Refresh"}</Button><Button asChild><Link href="/payroll-benefits/payroll">Review payroll<ArrowRight /></Link></Button></div></div>

    {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <section aria-label="Dashboard filters" className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"><span className="mr-1 hidden items-center gap-2 px-1 text-xs font-medium text-slate-500 sm:flex"><CalendarDays className="size-4" />Viewing</span><div className="relative"><select aria-label="Overview date range" value={filters.months} onChange={(event) => update({ ...filters, months: Number(event.target.value) as 3|6|12 })} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-slate-700"><option value="12">Last 12 months</option><option value="6">Last 6 months</option><option value="3">Last 3 months</option></select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div><div className="relative"><select aria-label="Overview department" value={filters.departmentId ?? ""} onChange={(event) => update({ ...filters, departmentId: event.target.value || null })} className="h-9 max-w-56 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-slate-700"><option value="">All departments</option>{data.options.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></div><div className="ml-auto flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><UsersRound className="size-3.5" /><span className="font-medium text-slate-700">{data.summary.employeeCount}</span> employees in scope</div></section>

    <section aria-label="Organization summary" className="mt-5 grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Active employees" value={String(data.summary.employeeCount)} helper="system owner excluded" trend="Live" icon={UsersRound} chart={data.departments.map((item) => item.employees)} /><KpiCard label="Current net payroll" value={moneyCompact(data.summary.currentNet)} helper={period} trend={percentChange(data.trend.map((item) => item.net))} icon={WalletCards} chart={data.trend.map((item) => item.net)} /><KpiCard label="Current benefits" value={moneyCompact(data.summary.currentBenefits)} helper={period} trend={percentChange(data.trend.map((item) => item.benefits))} icon={HeartPulse} chart={data.trend.map((item) => item.benefits)} /><KpiCard label="Open action items" value={String(data.summary.openActions)} helper="from saved records" trend="Needs review" icon={FileCheck2} chart={data.tasks.map((item) => item.count)} warning /></section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.7fr)]"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">People cost performance</h2><p className="mt-1 text-xs text-slate-500">Monthly totals calculated from payroll entries</p></div><div className="flex rounded-lg bg-slate-100 p-1">{(Object.keys(trendMeta) as TrendMetric[]).map((key) => <button key={key} onClick={() => { setMetric(key); setAnimationKey((value) => value+1); }} className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium transition",metric===key?"bg-white text-slate-900 shadow-sm":"text-slate-500")}>{trendMeta[key].label}</button>)}</div></div><div className="mt-5"><p className="text-2xl font-semibold text-slate-950">{moneyCompact(trendValues.at(-1) ?? 0)}</p><p className="mt-1 text-xs text-slate-500">Latest month in selected range · {percentChange(trendValues)} from prior month</p></div><PerformanceChart data={data.trend} metric={metric} version={animationKey} /></section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Payroll readiness</h2><p className="mt-1 text-xs text-slate-500">{period}</p></div>{readiness && <PayrollStatusBadge status={readiness.status} />}</div>{readiness ? <div className="p-5"><div className="flex items-end justify-between"><div><p className="text-xs text-slate-500">Scheduled payment</p><p className="mt-1 text-lg font-semibold text-slate-950">{readiness.payDate}</p></div><div className="text-right"><p className="text-xs text-slate-500">Net payroll</p><p className="mt-1 text-sm font-semibold">{formatCurrency(readiness.net)}</p></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="chart-bar-x-animate h-full rounded-full bg-indigo-500" style={{width:`${readiness.progress}%`}} /></div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{readiness.progress}% complete</span><span>{readiness.exceptions} exceptions</span></div><div className="mt-5 space-y-3">{[{label:"Payroll entries created",complete:readiness.employeeCount>0,icon:Banknote},{label:"Exceptions reviewed",complete:readiness.exceptions===0,icon:CircleAlert},{label:"Final approval",complete:["approved","paid"].includes(readiness.status),icon:BadgeCheck},{label:"Payment completed",complete:readiness.status==="paid",icon:Check}].map((step) => {const Icon=step.icon;return <div className="flex items-center gap-3" key={step.label}><span className={cn("grid size-7 place-items-center rounded-full",step.complete?"bg-emerald-50 text-emerald-600":"bg-slate-100 text-slate-400")}><Icon className="size-3.5" /></span><span className="text-sm text-slate-700">{step.label}</span></div>;})}</div><Button className="mt-5 w-full" asChild><Link href={`/payroll-benefits/payroll/${readiness.id}`}>Continue payroll review<ArrowRight /></Link></Button></div>:<div className="p-8 text-center text-sm text-slate-500">Create a payroll run to begin readiness tracking.</div>}</section></div>

    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Payroll operations pipeline</h2><p className="mt-1 text-xs text-slate-500">Counts from synchronized and saved operational records</p></div><span className="flex items-center gap-1.5 text-xs text-emerald-600"><Activity className="size-3.5" />Live</span></div><div className="grid gap-px bg-slate-200 md:grid-cols-5">{stages.map((stage,index) => {const Icon=stage.icon;return <Link href={stage.href} key={stage.label} className="group relative bg-white p-5 hover:bg-slate-50">{index<4&&<ChevronRight className="absolute -right-2.5 top-1/2 z-10 size-5 -translate-y-1/2 rounded-full border bg-white p-1 text-slate-300" />}<span className={cn("grid size-8 place-items-center rounded-lg",stage.complete?"bg-emerald-50 text-emerald-600":"bg-slate-100 text-slate-500")}><Icon className="size-4" /></span><p className="mt-4 truncate text-lg font-semibold text-slate-900">{stage.value}</p><p className="mt-1 text-xs font-medium text-slate-700">{stage.label}</p><p className="mt-0.5 text-[11px] text-slate-400">{stage.helper}</p></Link>;})}</div></section>

    <div className="mt-6 grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Action center</h2><p className="mt-1 text-xs text-slate-500">Derived from records awaiting review</p></div><span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{data.summary.openActions} open</span></div><div className="divide-y divide-slate-100">{data.tasks.map((task) => {const meta=taskMeta[task.type];const Icon=meta.icon;return <div className="flex items-center gap-3 px-5 py-4" key={task.type}><span className={cn("grid size-9 shrink-0 place-items-center rounded-lg",meta.tone)}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{meta.title}</p><p className="mt-0.5 text-xs text-slate-500">{task.count} record{task.count===1?"":"s"}{task.amount>0?` · ${formatCurrency(task.amount)}`:""}</p></div><Link href={meta.href} className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-700" aria-label={`Open ${meta.title}`}><ChevronRight className="size-4" /></Link></div>;})}</div></section>

      <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Workforce distribution</h2><p className="mt-1 text-xs text-slate-500">Live active headcount and current base compensation</p></div><Link href="/payroll-benefits/analytics" className="flex items-center gap-1 text-xs font-medium text-indigo-600">View analytics<ArrowRight className="size-3.5" /></Link></div><div className="mt-5 space-y-4">{data.departments.length?data.departments.map((item,index) => {const max=Math.max(...data.departments.map((entry)=>entry.employees),1);return <button key={item.id} onClick={() => update({...filters,departmentId:item.id})} className="block w-full text-left"><div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-medium text-slate-700">{item.name}</span><span className="tabular-nums text-slate-500">{item.employees} <span className="text-slate-400">· {moneyCompact(item.cost)}</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="chart-bar-x-animate h-full rounded-full bg-indigo-400" style={{width:`${item.employees/max*100}%`,animationDelay:`${index*60}ms`}} /></div></button>; }):<p className="py-8 text-center text-sm text-slate-500">No active payroll employees match these filters.</p>}</div></section></div>

    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Workspace activity</h2><p className="mt-1 text-xs text-slate-500">Database audit history</p></div><div className="flex rounded-lg bg-slate-100 p-1">{["all","payroll","claims","benefits"].map((tab)=><button key={tab} onClick={()=>setActivityTab(tab)} className={cn("rounded-md px-2.5 py-1 text-[11px] font-medium capitalize",activityTab===tab?"bg-white text-slate-800 shadow-sm":"text-slate-500")}>{tab}</button>)}</div></div><div className="divide-y divide-slate-100">{activities.map((item)=>{const Icon=activityIcons[item.entityType]??Activity;return <div className="flex items-center gap-3 px-5 py-3.5" key={item.id}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium capitalize text-slate-800">{item.action} {item.entityType.replaceAll("_"," ")}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.actor} · {item.entityId}</p></div><time className="shrink-0 text-xs text-slate-400">{relativeTime(item.created_at)}</time></div>;})}{!activities.length&&<div className="p-10 text-center text-sm text-slate-500">No saved activity in this category.</div>}</div></section>
  </div>;
}
