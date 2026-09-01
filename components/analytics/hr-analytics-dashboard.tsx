"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coins,
  Download,
  FileSpreadsheet,
  HeartPulse,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { downloadRecordsAsCsv, exportRecordsToExcel } from "@/lib/export-records";
import type { ExportRecord } from "@/types/operations";

type TrendPoint = { month: string; payroll: number };
type DepartmentCost = { department: string; amount: number; employees: number };

const baseTrend: TrendPoint[] = [
  { month: "Sep", payroll: 10.92 }, { month: "Oct", payroll: 11.08 }, { month: "Nov", payroll: 11.21 },
  { month: "Dec", payroll: 12.76 }, { month: "Jan", payroll: 11.54 }, { month: "Feb", payroll: 11.79 },
  { month: "Mar", payroll: 11.96 }, { month: "Apr", payroll: 12.08 }, { month: "May", payroll: 12.19 },
  { month: "Jun", payroll: 12.34 }, { month: "Jul", payroll: 12.28 }, { month: "Aug", payroll: 12.60 },
];

const departmentCosts: DepartmentCost[] = [
  { department: "Engineering", amount: 3.72, employees: 72 },
  { department: "Sales", amount: 2.81, employees: 51 },
  { department: "Customer Success", amount: 1.94, employees: 43 },
  { department: "Product & Design", amount: 1.82, employees: 36 },
  { department: "Operations", amount: 1.31, employees: 28 },
  { department: "Finance & People", amount: 1.0, employees: 18 },
];

const compensationBands = [
  { band: "< ₱30K", employees: 12 }, { band: "₱30–45K", employees: 54 }, { band: "₱45–60K", employees: 78 },
  { band: "₱60–80K", employees: 61 }, { band: "₱80–100K", employees: 28 }, { band: "₱100–150K", employees: 11 }, { band: "> ₱150K", employees: 4 },
];

const costMix = [
  { label: "Base salary", value: 68, amount: 10.86, color: "#4f46e5" },
  { label: "Allowances", value: 12, amount: 1.92, color: "#0ea5e9" },
  { label: "Contributions", value: 10, amount: 1.60, color: "#10b981" },
  { label: "Overtime", value: 6, amount: 0.96, color: "#f59e0b" },
  { label: "Benefits", value: 4, amount: 0.64, color: "#94a3b8" },
];

const departmentFactors: Record<string, number> = { all: 1, engineering: 0.295, sales: 0.223, customer_success: 0.154, product_design: 0.144, operations: 0.104, finance_people: 0.08 };
const locationFactors: Record<string, number> = { all: 1, manila: 0.61, cebu: 0.23, remote: 0.16 };
const employmentFactors: Record<string, number> = { all: 1, regular: 0.91, probationary: 0.06, contract: 0.03 };

const analyticsExportColumns = [
  { key: "metric", label: "Analytics Metric", width: 32 }, { key: "value", label: "Value", width: 18 },
  { key: "unit", label: "Unit", width: 18 }, { key: "period", label: "Period", width: 20 }, { key: "model", label: "Source / Model", width: 22 },
];

function SelectFilter({ label, icon: Icon, value, onChange, children }: { label: string; icon: typeof CalendarDays; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="min-w-[156px] flex-1 lg:flex-none">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</span>
      <span className="relative block">
        <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}

function KpiCard({ label, value, helper, change, direction, icon: Icon }: { label: string; value: string; helper: string; change: string; direction: "up" | "down"; icon: typeof Banknote }) {
  const TrendIcon = direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="min-w-0 border-r border-slate-200 p-4 last:border-r-0 sm:p-5">
      <div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-slate-500">{label}</p><span className="grid size-8 place-items-center rounded-lg bg-slate-50 text-slate-500"><Icon className="size-4" /></span></div>
      <p className="mt-2 truncate text-xl font-semibold tracking-[-0.025em] text-slate-950">{value}</p>
      <div className="mt-1.5 flex items-center gap-1 text-xs"><span className={cn("flex items-center font-medium", direction === "up" ? "text-emerald-600" : "text-sky-600")}><TrendIcon className="mr-0.5 size-3" />{change}</span><span className="truncate text-slate-500">{helper}</span></div>
    </div>
  );
}

function ChartHeader({ title, description, legend }: { title: string; description: string; legend?: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
      {legend && <div className="flex flex-wrap items-center gap-3">{legend.map((item) => <span className="flex items-center gap-1.5 text-xs text-slate-500" key={item.label}><span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>}
    </div>
  );
}

function ChartEmptyState() {
  return <div className="grid h-[260px] place-items-center text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500"><BarChart3 className="size-5" /></span><p className="mt-3 text-sm font-semibold text-slate-800">No analytics data available</p><p className="mt-1 text-xs text-slate-500">Try broadening the selected filters.</p></div></div>;
}

function PayrollTrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <ChartEmptyState />;
  const width = 680;
  const height = 245;
  const chartLeft = 48;
  const chartRight = 658;
  const chartTop = 20;
  const chartBottom = 200;
  const min = Math.floor(Math.min(...data.map((point) => point.payroll)) - 1);
  const max = Math.ceil(Math.max(...data.map((point) => point.payroll)) + 0.5);
  const x = (index: number) => chartLeft + (index * (chartRight - chartLeft)) / Math.max(data.length - 1, 1);
  const y = (value: number) => chartBottom - ((value - min) / (max - min)) * (chartBottom - chartTop);
  const points = data.map((point, index) => `${x(index)},${y(point.payroll)}`).join(" ");
  const area = `M ${points.replaceAll(" ", " L ")} L ${chartRight},${chartBottom} L ${chartLeft},${chartBottom} Z`;
  const yTicks = [min, min + (max - min) / 2, max];

  return (
    <div className="mt-6 h-[270px] w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label={`Monthly payroll trend from ${data[0].payroll.toFixed(2)} to ${data.at(-1)?.payroll.toFixed(2)} million pesos`}>
        {yTicks.map((tick) => <g key={tick}><line x1={chartLeft} x2={chartRight} y1={y(tick)} y2={y(tick)} stroke="#e8ebf0" strokeDasharray="3 4" /><text x="0" y={y(tick) + 4} fill="#94a3b8" fontSize="10">₱{tick.toFixed(0)}M</text></g>)}
        <path d={area} fill="#4f46e5" fillOpacity="0.055" className="chart-area-animate" />
        <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line-animate" vectorEffect="non-scaling-stroke" />
        {data.map((point, index) => (
          <g className="group" key={point.month}>
            <circle cx={x(index)} cy={y(point.payroll)} r="11" fill="transparent"><title>{point.month}: ₱{point.payroll.toFixed(2)}M</title></circle>
            <circle cx={x(index)} cy={y(point.payroll)} r="3.5" fill="white" stroke="#4f46e5" strokeWidth="2" className="chart-point-animate" style={{ animationDelay: `${520 + index * 55}ms` }} />
            <g opacity="0" className="transition-opacity group-hover:opacity-100">
              <rect x={Math.min(x(index) - 39, chartRight - 78)} y={y(point.payroll) - 37} width="78" height="25" rx="6" fill="#172033" />
              <text x={Math.min(x(index), chartRight - 39)} y={y(point.payroll) - 21} fill="white" fontSize="10" textAnchor="middle">₱{point.payroll.toFixed(2)}M</text>
            </g>
            <text x={x(index)} y="228" textAnchor="middle" fill="#94a3b8" fontSize="10">{point.month}</text>
          </g>
        ))}
      </svg>
      <table className="sr-only"><caption>Monthly payroll cost trend</caption><tbody>{data.map((point) => <tr key={point.month}><th>{point.month}</th><td>{point.payroll.toFixed(2)} million pesos</td></tr>)}</tbody></table>
    </div>
  );
}

function DepartmentBarChart({ data }: { data: DepartmentCost[] }) {
  if (!data.length) return <ChartEmptyState />;
  const max = Math.max(...data.map((item) => item.amount));
  return (
    <div className="mt-6 space-y-4" role="img" aria-label="Payroll cost by department">
      {data.map((item, index) => (
        <div className="grid grid-cols-[118px_minmax(120px,1fr)_70px] items-center gap-3" key={item.department} title={`${item.department}: ₱${item.amount.toFixed(2)}M across ${item.employees} employees`}>
          <span className="truncate text-xs font-medium text-slate-600">{item.department}</span>
          <div className="h-7 overflow-hidden rounded-md bg-slate-50"><div className="chart-bar-x-animate flex h-full items-center justify-end rounded-md bg-indigo-500 pr-2 text-[10px] font-medium text-white" style={{ width: `${(item.amount / max) * 100}%`, animationDelay: `${index * 80}ms` }}>{item.employees}</div></div>
          <span className="text-right text-xs font-semibold tabular-nums text-slate-700">₱{item.amount.toFixed(2)}M</span>
        </div>
      ))}
      <div className="grid grid-cols-[118px_1fr_70px] gap-3 pt-1 text-[10px] text-slate-400"><span /><div className="flex justify-between"><span>₱0</span><span>₱2M</span><span>₱4M</span></div><span /></div>
      <table className="sr-only"><caption>Payroll cost by department</caption><tbody>{data.map((item) => <tr key={item.department}><th>{item.department}</th><td>{item.amount} million pesos</td><td>{item.employees} employees</td></tr>)}</tbody></table>
    </div>
  );
}

function CostMixDonut({ factor }: { factor: number }) {
  const offsets = costMix.map((_, index) => costMix.slice(0, index).reduce((sum, item) => sum + item.value, 0));
  return (
    <div className="mt-5 grid items-center gap-6 sm:grid-cols-[190px_1fr]">
      <div className="relative mx-auto size-[180px]">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label="Total people cost composition">
          <circle cx="60" cy="60" r="43" fill="none" stroke="#f1f5f9" strokeWidth="14" />
          {costMix.map((item, index) => {
            return <circle key={item.label} cx="60" cy="60" r="43" pathLength="100" fill="none" stroke={item.color} strokeWidth="14" strokeDasharray={`${item.value} ${100 - item.value}`} strokeDashoffset={-offsets[index]} className="chart-donut-animate" style={{ animationDelay: `${index * 90}ms` }}><title>{item.label}: {item.value}%</title></circle>;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-lg font-semibold text-slate-950">₱{(15.98 * factor).toFixed(2)}M</p><p className="text-[10px] text-slate-500">Total cost</p></div></div>
      </div>
      <div className="space-y-3">
        {costMix.map((item) => <div className="flex items-center gap-2" key={item.label}><span className="size-2.5 rounded-sm" style={{ backgroundColor: item.color }} /><span className="min-w-0 flex-1 text-xs text-slate-600">{item.label}</span><span className="text-xs font-medium tabular-nums text-slate-800">₱{(item.amount * factor).toFixed(2)}M</span><span className="w-8 text-right text-[10px] text-slate-400">{item.value}%</span></div>)}
      </div>
    </div>
  );
}

function CompensationDistribution({ factor }: { factor: number }) {
  const adjusted = compensationBands.map((item) => ({ ...item, employees: Math.max(1, Math.round(item.employees * factor)) }));
  const max = Math.max(...adjusted.map((item) => item.employees));
  return (
    <div className="mt-6">
      <div className="flex h-[205px] items-end gap-2 border-b border-slate-200 px-1 sm:gap-3" role="img" aria-label="Employee compensation distribution by monthly salary range">
        {adjusted.map((item, index) => (
          <div className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center" key={item.band} title={`${item.band}: ${item.employees} employees`}>
            <span className="mb-1 text-[10px] font-semibold text-slate-600 opacity-0 transition group-hover:opacity-100">{item.employees}</span>
            <div className="chart-bar-y-animate mx-auto w-full max-w-[54px] rounded-t-md bg-sky-500 transition-colors group-hover:bg-sky-600" style={{ height: `${Math.max(8, (item.employees / max) * 165)}px`, animationDelay: `${index * 75}ms` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 text-center text-[9px] leading-3 text-slate-400 sm:text-[10px]">{adjusted.map((item) => <span key={item.band}>{item.band}</span>)}</div>
      <table className="sr-only"><caption>Compensation distribution</caption><tbody>{adjusted.map((item) => <tr key={item.band}><th>{item.band}</th><td>{item.employees} employees</td></tr>)}</tbody></table>
    </div>
  );
}

function AttendanceIntelligence({ factor }: { factor: number }) {
  const classes = [
    { label: "On time", value: 82.4, color: "#10b981" }, { label: "Late", value: 8.9, color: "#f59e0b" },
    { label: "Absent", value: 3.2, color: "#ef4444" }, { label: "Overtime", value: 5.5, color: "#4f46e5" },
  ];
  const weekly = [94, 91, 96, 89, 93, 84, 87];
  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <ChartHeader title="Attendance classification" description="XGBoost classification of synchronized time records" legend={classes.map((item) => ({ label: item.label, color: item.color }))} />
        <div className="mt-7 flex h-9 overflow-hidden rounded-lg bg-slate-100" role="img" aria-label="Attendance classifications: 82.4 percent on time, 8.9 percent late, 3.2 percent absent, and 5.5 percent overtime">
          {classes.map((item, index) => <div key={item.label} className="chart-bar-x-animate h-full border-r border-white/70 last:border-r-0" style={{ width: `${item.value}%`, backgroundColor: item.color, animationDelay: `${index * 110}ms` }} title={`${item.label}: ${item.value}%`} />)}
        </div>
        <div className="mt-6 grid grid-cols-4 gap-3">{classes.map((item) => <div key={item.label}><p className="text-lg font-semibold text-slate-900">{item.value}%</p><p className="mt-0.5 text-xs text-slate-500">{item.label}</p></div>)}</div>
        <div className="my-6 h-px bg-slate-100" />
        <div className="flex items-end justify-between"><div><h3 className="text-xs font-semibold text-slate-700">Daily attendance score</h3><p className="mt-1 text-[11px] text-slate-400">Pattern confidence over the last 7 days</p></div><span className="text-xs font-medium text-emerald-600">92.1 average</span></div>
        <div className="mt-4 flex h-[105px] items-end gap-3 border-b border-slate-200 px-2">{weekly.map((value, index) => <div className="flex min-w-0 flex-1 flex-col items-center justify-end" key={index} title={`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}: ${value}`}><span className="mb-1 text-[9px] font-medium text-slate-500">{value}</span><div className="chart-bar-y-animate w-full max-w-10 rounded-t bg-indigo-400" style={{ height: `${value - 28}%`, animationDelay: `${index * 70}ms` }} /></div>)}</div>
        <div className="mt-2 grid grid-cols-7 text-center text-[10px] text-slate-400">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Attendance anomaly detection</h2><p className="mt-1 text-xs text-slate-500">Records flagged by the XGBoost model</p></div><span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">3 anomalies</span></div>
        <div className="divide-y divide-slate-100">{[
          { employee: "Rafael Cruz", signal: "Repeated late arrival pattern", confidence: 94, severity: "High" },
          { employee: "Luis Villanueva", signal: "Unexpected absence sequence", confidence: 87, severity: "Medium" },
          { employee: "Jana Lim", signal: "Overtime outside usual pattern", confidence: 81, severity: "Low" },
        ].map((item) => <div className="p-4" key={item.employee}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-800">{item.employee}</p><p className="mt-1 text-xs text-slate-500">{item.signal}</p></div><span className={cn("rounded-md px-2 py-1 text-[10px] font-medium", item.severity === "High" ? "bg-red-50 text-red-700" : item.severity === "Medium" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>{item.severity}</span></div><div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="chart-bar-x-animate h-full rounded-full bg-indigo-500" style={{ width: `${item.confidence}%` }} /></div><span className="text-[10px] font-medium text-slate-500">{item.confidence}% confidence</span></div></div>)}</div>
        <div className="border-t bg-slate-50/70 p-4"><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Model</span><span className="font-medium text-slate-700">XGBoost Attendance v2.4</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">Validation accuracy</span><span className="font-medium text-emerald-600">94.7%</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">Records evaluated</span><span className="font-medium text-slate-700">{Math.round(5428 * factor).toLocaleString()}</span></div></div>
      </section>
    </div>
  );
}

export function HrAnalyticsDashboard() {
  const [range, setRange] = useState("12_months");
  const [department, setDepartment] = useState("all");
  const [location, setLocation] = useState("all");
  const [employment, setEmployment] = useState("all");
  const [animationKey, setAnimationKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const factor = departmentFactors[department] * locationFactors[location] * employmentFactors[employment];
  const trend = useMemo(() => {
    const count = range === "6_months" ? 6 : range === "ytd" ? 8 : 12;
    return baseTrend.slice(-count).map((point) => ({ ...point, payroll: point.payroll * factor }));
  }, [factor, range]);
  const bars = department === "all" ? departmentCosts.map((item) => ({ ...item, amount: item.amount * locationFactors[location] * employmentFactors[employment], employees: Math.max(1, Math.round(item.employees * locationFactors[location] * employmentFactors[employment])) })) : departmentCosts.filter((item) => item.department.toLowerCase().replaceAll(" & ", "_").replaceAll(" ", "_") === department).map((item) => ({ ...item, amount: item.amount * locationFactors[location] * employmentFactors[employment], employees: Math.max(1, Math.round(item.employees * locationFactors[location] * employmentFactors[employment])) }));

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setAnimationKey((key) => key + 1);
  }

  function refreshCharts() {
    setRefreshing(true);
    setAnimationKey((key) => key + 1);
    window.setTimeout(() => setRefreshing(false), 650);
    toast.success("Analytics refreshed", { description: "Charts now reflect the latest payroll and benefits data." });
  }

  const analyticsRows: ExportRecord[] = [
    { metric: "Monthly payroll cost", value: 12.6 * factor, unit: "PHP millions", period: "August 2026", model: "Payroll ledger" },
    { metric: "Benefits cost", value: 0.8574 * factor, unit: "PHP millions", period: "August 2026", model: "Benefits ledger" },
    { metric: "Employer contributions", value: 1.224 * factor, unit: "PHP millions", period: "August 2026", model: "Payroll ledger" },
    { metric: "Average compensation", value: 54280 * Math.max(0.96, employmentFactors[employment]), unit: "PHP monthly", period: "August 2026", model: "Compensation ledger" },
    { metric: "On-time attendance", value: 82.4, unit: "Percent", period: "August 2026", model: "XGBoost Attendance v2.4" },
    { metric: "Attendance anomalies", value: 3, unit: "Records", period: "Last 30 days", model: "XGBoost Attendance v2.4" },
  ];

  async function exportReport() {
    await exportRecordsToExcel("hr-analytics-2026-08", "HR Analytics", analyticsExportColumns, analyticsRows);
    toast.success("Analytics Excel report exported");
  }

  const employeeCount = Math.max(1, Math.round(248 * factor));

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500"><span>Payroll & Benefits</span><ChevronRight className="size-3.5 text-slate-300" /><span className="text-slate-700">HR Analytics</span></nav>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div><div className="flex items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">HR Analytics</h1><span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Live</span></div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Understand payroll cost, compensation, contributions, overtime, and benefits across your organization.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={() => { downloadRecordsAsCsv("hr-analytics-2026-08", analyticsExportColumns, analyticsRows); toast.success("Analytics results downloaded"); }}><Download />Download</Button><Button variant="secondary" onClick={exportReport}><FileSpreadsheet />Export Excel</Button><Button onClick={refreshCharts} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : ""} />{refreshing ? "Refreshing…" : "Refresh data"}</Button></div>
      </div>

      <section aria-label="Analytics filters" className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-1 hidden size-9 place-items-center rounded-lg bg-slate-50 text-slate-500 lg:grid"><SlidersHorizontal className="size-4" /></div>
          <SelectFilter label="Date range" icon={CalendarDays} value={range} onChange={(value) => changeFilter(setRange, value)}><option value="12_months">Last 12 months</option><option value="6_months">Last 6 months</option><option value="ytd">Year to date</option></SelectFilter>
          <SelectFilter label="Department" icon={Building2} value={department} onChange={(value) => changeFilter(setDepartment, value)}><option value="all">All departments</option><option value="engineering">Engineering</option><option value="sales">Sales</option><option value="customer_success">Customer Success</option><option value="product_design">Product & Design</option><option value="operations">Operations</option><option value="finance_people">Finance & People</option></SelectFilter>
          <SelectFilter label="Location" icon={MapPin} value={location} onChange={(value) => changeFilter(setLocation, value)}><option value="all">All locations</option><option value="manila">Metro Manila</option><option value="cebu">Cebu</option><option value="remote">Remote</option></SelectFilter>
          <SelectFilter label="Employment type" icon={UsersRound} value={employment} onChange={(value) => changeFilter(setEmployment, value)}><option value="all">All employees</option><option value="regular">Regular</option><option value="probationary">Probationary</option><option value="contract">Contract</option></SelectFilter>
          <div className="ml-auto pb-0.5 text-xs text-slate-400">{employeeCount} employees in scope</div>
        </div>
      </section>

      <section aria-label="Key HR metrics" className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Monthly payroll cost" value={formatCurrency(12_600_000 * factor)} helper="vs. prior month" change="2.6%" direction="up" icon={WalletCards} />
        <KpiCard label="Benefits cost" value={formatCurrency(857_400 * factor)} helper="₱3,457 per employee" change="0.8%" direction="up" icon={HeartPulse} />
        <KpiCard label="Employer contributions" value={formatCurrency(1_224_000 * factor)} helper="9.7% of gross pay" change="1.9%" direction="up" icon={Coins} />
        <KpiCard label="Average compensation" value={formatCurrency(54_280 * Math.max(0.96, employmentFactors[employment]))} helper="monthly base salary" change="1.4%" direction="up" icon={Banknote} />
      </section>

      <div key={`primary-${animationKey}`} className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.85fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><ChartHeader title="Payroll cost trend" description="Total monthly payroll cost in Philippine pesos" legend={[{ label: "Payroll cost", color: "#4f46e5" }]} /><PayrollTrendChart data={trend} /></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><ChartHeader title="Payroll by department" description="Monthly cost and employees in scope" legend={[{ label: "Employee count inside bars", color: "#6366f1" }]} /><DepartmentBarChart data={bars} /></section>
      </div>

      <div key={`secondary-${animationKey}`} className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><ChartHeader title="Total people cost" description="Payroll, contributions, and benefits composition" /><CostMixDonut factor={factor} /></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]"><ChartHeader title="Compensation distribution" description="Employees grouped by monthly base salary" legend={[{ label: "Employees", color: "#0ea5e9" }]} /><CompensationDistribution factor={factor} /></section>
      </div>

      <div key={`attendance-${animationKey}`}><AttendanceIntelligence factor={factor} /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <ChartHeader title="Cost drivers" description="Changes with the largest impact this month" />
          <div className="mt-5 divide-y divide-slate-100">
            {[{ label: "Overtime cost", amount: 486200, change: "+12.4%", helper: "Sales and Customer Success drove 64% of the increase", icon: Clock3, tone: "text-amber-600 bg-amber-50" }, { label: "Claims cost", amount: 318450, change: "−6.8%", helper: "Medical claims decreased after the July peak", icon: CircleAlert, tone: "text-sky-600 bg-sky-50" }, { label: "New-hire payroll impact", amount: 224800, change: "+4 hires", helper: "Three Engineering hires and one Finance hire", icon: UsersRound, tone: "text-indigo-600 bg-indigo-50" }].map((item) => { const Icon = item.icon; return <div className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0" key={item.label}><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${item.tone}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{item.label}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.helper}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums text-slate-800">{formatCurrency(item.amount * factor)}</p><p className={cn("mt-0.5 text-xs font-medium", item.change.startsWith("+") ? "text-amber-600" : "text-emerald-600")}>{item.change}</p></div></div>; })}
          </div>
        </section>
        <aside className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5">
          <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm"><Sparkles className="size-4" /></span><h2 className="text-sm font-semibold text-slate-900">Analytics insight</h2></div>
          <p className="mt-4 text-sm leading-6 text-slate-600">Overtime grew faster than headcount this month. Sales accounts for the largest increase, primarily during the last five business days.</p>
          <div className="mt-4 rounded-lg border border-indigo-100 bg-white/80 p-3"><p className="text-xs font-medium text-slate-700">Suggested follow-up</p><p className="mt-1 text-xs leading-5 text-slate-500">Review shift coverage and approval thresholds before the September 1–15 payroll period.</p></div>
          <button className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:text-indigo-800">Review overtime details<ChevronRight className="size-3.5" /></button>
        </aside>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><RefreshCw className="size-3.5" />Last refreshed August 28, 2026 at 2:45 PM · Values include approved payroll runs</div>
    </div>
  );
}
