"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Banknote, BarChart3, Building2, CalendarDays, ChevronDown, ChevronRight,
  CircleAlert, Clock3, Coins, Download, FileSpreadsheet, HeartPulse, MapPin,
  RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles, UsersRound, WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { loadLiveDashboard, runAutomaticAttendanceScoring } from "@/app/actions/dashboard";
import { Button } from "@/components/ui/button";
import { downloadRecordsAsCsv, exportRecordsToExcel } from "@/lib/export-records";
import type { DashboardFilters, LiveDashboardData } from "@/lib/dashboard/schema";
import { cn, formatCurrency } from "@/lib/utils";
import type { ExportRecord } from "@/types/operations";

const analyticsExportColumns = [
  { key: "metric", label: "Analytics Metric", width: 32 },
  { key: "value", label: "Value", width: 18 },
  { key: "unit", label: "Unit", width: 18 },
  { key: "period", label: "Period", width: 22 },
  { key: "source", label: "Source / Model", width: 26 },
];

const classMeta: Record<string, { label: string; color: string }> = {
  on_time: { label: "On time", color: "#10b981" },
  late: { label: "Late", color: "#f59e0b" },
  absent: { label: "Absent", color: "#ef4444" },
  overtime: { label: "Overtime", color: "#4f46e5" },
  on_leave: { label: "On leave", color: "#94a3b8" },
};

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return formatCurrency(value);
}

function displayLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SelectFilter({ label, icon: Icon, value, onChange, children }: { label: string; icon: typeof CalendarDays; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="min-w-[156px] flex-1 lg:flex-none"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</span><span className="relative block"><Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-700 shadow-sm focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100">{children}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /></span></label>;
}

function ChartHeader({ title, description, legend }: { title: string; description: string; legend?: { label: string; color: string }[] }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>{legend&&<div className="flex flex-wrap items-center gap-3">{legend.map((item)=><span className="flex items-center gap-1.5 text-xs text-slate-500" key={item.label}><span className="size-2 rounded-full" style={{backgroundColor:item.color}} />{item.label}</span>)}</div>}</div>;
}

function EmptyChart({ message }: { message: string }) {
  return <div className="grid h-[250px] place-items-center text-center"><div><span className="mx-auto grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500"><BarChart3 className="size-5" /></span><p className="mt-3 text-sm font-semibold text-slate-800">No live data yet</p><p className="mt-1 text-xs text-slate-500">{message}</p></div></div>;
}

function KpiCard({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Banknote }) {
  return <div className="min-w-0 border-r border-slate-200 p-5 last:border-r-0"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-slate-500">{label}</p><span className="grid size-8 place-items-center rounded-lg bg-slate-50 text-slate-500"><Icon className="size-4" /></span></div><p className="mt-2 truncate text-xl font-semibold tracking-[-0.025em] text-slate-950">{value}</p><p className="mt-1.5 truncate text-xs text-slate-500">{helper}</p></div>;
}

function PayrollTrendChart({ data }: { data: LiveDashboardData["trend"] }) {
  const values = data.map((point) => point.gross);
  if (!data.length || values.every((value) => value === 0)) return <EmptyChart message="Create payroll entries to populate monthly cost trends." />;
  const left=58,right=658,top=20,bottom=200,width=680,height=245;
  const min=Math.min(...values),max=Math.max(...values),padding=Math.max((max-min)*0.12,max*0.05,1),low=Math.max(0,min-padding),high=max+padding;
  const x=(index:number)=>left+index*(right-left)/Math.max(data.length-1,1);
  const y=(value:number)=>bottom-((value-low)/Math.max(high-low,1))*(bottom-top);
  const points=values.map((value,index)=>`${x(index)},${y(value)}`).join(" ");
  return <div className="mt-6 h-[270px] w-full"><svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img" aria-label="Live monthly gross payroll trend">{[top,(top+bottom)/2,bottom].map((line,index)=><g key={line}><line x1={left} x2={right} y1={line} y2={line} stroke="#e8ebf0" strokeDasharray="3 4" /><text x="0" y={line+4} fill="#94a3b8" fontSize="10">{compactMoney([high,(high+low)/2,low][index])}</text></g>)}<path d={`M ${points.replaceAll(" "," L ")} L ${right},${bottom} L ${left},${bottom} Z`} fill="#4f46e5" fillOpacity="0.055" className="chart-area-animate" /><polyline points={points} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="chart-line-animate" />{data.map((point,index)=><g key={point.month}><circle cx={x(index)} cy={y(point.gross)} r="3.5" fill="white" stroke="#4f46e5" strokeWidth="2" className="chart-point-animate"><title>{point.label}: {formatCurrency(point.gross)}</title></circle><text x={x(index)} y="228" textAnchor="middle" fill="#94a3b8" fontSize="10">{point.label}</text></g>)}</svg></div>;
}

function DepartmentBars({ data }: { data: LiveDashboardData["departments"] }) {
  if (!data.length) return <EmptyChart message="Add active employees with departments and salary history." />;
  const max=Math.max(...data.map((item)=>item.cost),1);
  return <div className="mt-6 space-y-4">{data.map((item,index)=><div className="grid grid-cols-[110px_minmax(100px,1fr)_78px] items-center gap-3" key={item.id}><span className="truncate text-xs font-medium text-slate-600">{item.name}</span><div className="h-7 overflow-hidden rounded-md bg-slate-50"><div className="chart-bar-x-animate flex h-full min-w-7 items-center justify-end rounded-md bg-indigo-500 pr-2 text-[10px] font-medium text-white" style={{width:`${item.cost/max*100}%`,animationDelay:`${index*80}ms`}}>{item.employees}</div></div><span className="text-right text-xs font-semibold text-slate-700">{compactMoney(item.cost)}</span></div>)}</div>;
}

function CostMix({ data }: { data: LiveDashboardData["costMix"] }) {
  const items=[{label:"Base salary",amount:data.baseSalary,color:"#4f46e5"},{label:"Allowances",amount:data.allowances,color:"#0ea5e9"},{label:"Contributions",amount:data.contributions,color:"#10b981"},{label:"Overtime",amount:data.overtime,color:"#f59e0b"},{label:"Benefits",amount:data.benefits,color:"#94a3b8"}];
  const total=items.reduce((sum,item)=>sum+item.amount,0);
  if (!total) return <EmptyChart message="Add payroll entries to calculate the current cost mix." />;
  const values=items.map((item)=>item.amount/total*100); const offsets=values.map((_,index)=>values.slice(0,index).reduce((sum,value)=>sum+value,0));
  return <div className="mt-5 grid items-center gap-6 sm:grid-cols-[190px_1fr]"><div className="relative mx-auto size-[180px]"><svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label="Live people cost composition"><circle cx="60" cy="60" r="43" fill="none" stroke="#f1f5f9" strokeWidth="14" />{items.map((item,index)=><circle key={item.label} cx="60" cy="60" r="43" pathLength="100" fill="none" stroke={item.color} strokeWidth="14" strokeDasharray={`${values[index]} ${100-values[index]}`} strokeDashoffset={-offsets[index]} className="chart-donut-animate"><title>{item.label}: {values[index].toFixed(1)}%</title></circle>)}</svg><div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-lg font-semibold text-slate-950">{compactMoney(total)}</p><p className="text-[10px] text-slate-500">Total cost</p></div></div></div><div className="space-y-3">{items.map((item,index)=><div className="flex items-center gap-2" key={item.label}><span className="size-2.5 rounded-sm" style={{backgroundColor:item.color}} /><span className="min-w-0 flex-1 text-xs text-slate-600">{item.label}</span><span className="text-xs font-medium text-slate-800">{compactMoney(item.amount)}</span><span className="w-10 text-right text-[10px] text-slate-400">{values[index].toFixed(1)}%</span></div>)}</div></div>;
}

function CompensationDistribution({ data }: { data: LiveDashboardData["compensationBands"] }) {
  const max=Math.max(...data.map((item)=>item.employees),0);
  if (!max) return <EmptyChart message="Add effective employee compensation records." />;
  return <div className="mt-6"><div className="flex h-[205px] items-end gap-2 border-b border-slate-200 px-1">{data.map((item,index)=><div className="group flex h-full min-w-0 flex-1 flex-col justify-end text-center" key={item.band}><span className="mb-1 text-[10px] font-semibold text-slate-600">{item.employees}</span><div className="chart-bar-y-animate mx-auto w-full max-w-[54px] rounded-t-md bg-sky-500" style={{height:`${Math.max(8,item.employees/max*165)}px`,animationDelay:`${index*75}ms`}} /></div>)}</div><div className="mt-2 grid grid-cols-7 gap-2 text-center text-[9px] leading-3 text-slate-400">{data.map((item)=><span key={item.band}>{item.band}</span>)}</div></div>;
}

function AttendanceIntelligence({ data }: { data: LiveDashboardData }) {
  const total=data.attendance.total;
  const classes=data.attendance.classes.map((item)=>({ ...item, ...(classMeta[item.classification]??{label:displayLabel(item.classification),color:"#64748b"}), percent:total?item.count/total*100:0 }));
  const maxDaily=Math.max(...data.attendance.daily.map((item)=>item.score??0),1);
  return <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]"><section className="rounded-xl border border-slate-200 bg-white p-5"><ChartHeader title="Attendance classification" description="Classification of saved time records" legend={classes.map((item)=>({label:item.label,color:item.color}))} />{total?<><div className="mt-7 flex h-9 overflow-hidden rounded-lg bg-slate-100">{classes.map((item,index)=><div key={item.classification} className="chart-bar-x-animate h-full border-r border-white/70" style={{width:`${item.percent}%`,backgroundColor:item.color,animationDelay:`${index*110}ms`}} title={`${item.label}: ${item.percent.toFixed(1)}%`} />)}</div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">{classes.map((item)=><div key={item.classification}><p className="text-lg font-semibold text-slate-900">{item.percent.toFixed(1)}%</p><p className="text-xs text-slate-500">{item.label} · {item.count}</p></div>)}</div><div className="my-6 h-px bg-slate-100" /><h3 className="text-xs font-semibold text-slate-700">Daily attendance score</h3><div className="mt-4 flex h-[115px] items-end gap-3 border-b border-slate-200 px-2">{data.attendance.daily.map((item,index)=><div className="flex min-w-0 flex-1 flex-col items-center justify-end" key={item.date}><span className="mb-1 text-[9px] text-slate-500">{item.score?.toFixed(0)??0}</span><div className="chart-bar-y-animate w-full max-w-10 rounded-t bg-indigo-400" style={{height:`${Math.max(4,(item.score??0)/maxDaily*88)}px`,animationDelay:`${index*70}ms`}} /></div>)}</div><div className="mt-2 flex justify-around text-[10px] text-slate-400">{data.attendance.daily.map((item)=><span key={item.date}>{new Date(`${item.date}T00:00:00`).toLocaleDateString(undefined,{weekday:"short"})}</span>)}</div></>:<EmptyChart message="Synchronize or create attendance records to see classifications." />}</section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-sm font-semibold text-slate-900">Attendance anomaly detection</h2><p className="mt-1 text-xs text-slate-500">Persisted XGBoost results requiring review</p></div><span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{data.anomalies.length} anomalies</span></div><div className="divide-y divide-slate-100">{data.anomalies.map((item)=><div className="p-4" key={item.id}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-800">{item.employee}</p><p className="mt-1 text-xs text-slate-500">{item.reasons.join(", ")||displayLabel(item.predictedClass)}</p></div><span className={cn("rounded-md px-2 py-1 text-[10px] font-medium",item.anomalyScore>=0.9?"bg-red-50 text-red-700":"bg-amber-50 text-amber-700")}>{Math.round(item.anomalyScore*100)}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="chart-bar-x-animate h-full rounded-full bg-indigo-500" style={{width:`${item.classProbability*100}%`}} /></div></div>)}{!data.anomalies.length&&<div className="p-8 text-center text-sm text-slate-500">{data.model?"No anomalies above the 70% threshold.":"Model results appear automatically when scoring is configured and attendance records exist."}</div>}</div><div className="border-t bg-slate-50/70 p-4"><div className="flex items-center justify-between text-xs"><span className="text-slate-500">Model</span><span className="font-medium text-slate-700">{data.model?`${data.model.name} ${data.model.version}`:"Not run"}</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">Validation accuracy</span><span className="font-medium text-slate-700">{data.model?.validationAccuracy!=null?`${(data.model.validationAccuracy*100).toFixed(1)}%`:"Not supplied"}</span></div><div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500">Records scored</span><span className="font-medium text-slate-700">{data.model?.recordsScored.toLocaleString()??0}</span></div></div></section></div>;
}

export function HrAnalyticsDashboard({ initialData }: { initialData: LiveDashboardData }) {
  const [data,setData]=useState(initialData);
  const [filters,setFilters]=useState<DashboardFilters>({months:12,departmentId:null,location:null,employmentType:null});
  const [animationKey,setAnimationKey]=useState(0);
  const [error,setError]=useState("");
  const [pending,startTransition]=useTransition();
  const [scoring,setScoring]=useState(false);
  const [scoringStatus,setScoringStatus]=useState("");
  const requestId=useRef(0);
  const scoringStarted=useRef(false);
  const filtersRef=useRef(filters);

  function update(next:DashboardFilters,notify=false){const id=++requestId.current;filtersRef.current=next;setFilters(next);setError("");startTransition(async()=>{const result=await loadLiveDashboard(next);if(id!==requestId.current)return;if(!result.ok){setError(result.message);toast.error("Analytics refresh failed",{description:result.message});return;}setData(result.data);setAnimationKey((key)=>key+1);if(notify)toast.success("Live analytics refreshed");});}

  useEffect(()=>{
    if(scoringStarted.current)return;
    scoringStarted.current=true;
    startTransition(()=>{
      void (async()=>{
        setScoring(true);
        const result=await runAutomaticAttendanceScoring();
        setScoring(false);
        setScoringStatus(result.message);
        if(result.status==="completed")update(filtersRef.current);
      })();
    });
  },[]);

  const period=data.readiness?`${data.readiness.periodStart} to ${data.readiness.periodEnd}`:"Current snapshot";
  const rows:ExportRecord[]=[
    {metric:"Active payroll employees",value:data.summary.employeeCount,unit:"Employees",period:"Current",source:"Profiles"},
    {metric:"Gross payroll",value:data.summary.currentGross,unit:"PHP",period,source:"Payroll ledger"},
    {metric:"Net payroll",value:data.summary.currentNet,unit:"PHP",period,source:"Payroll ledger"},
    {metric:"Benefits",value:data.summary.currentBenefits,unit:"PHP",period,source:"Payroll ledger"},
    {metric:"Employer contributions",value:data.summary.currentContributions,unit:"PHP",period,source:"Payroll ledger"},
    {metric:"Average monthly compensation",value:data.summary.averageCompensation,unit:"PHP",period:"Effective today",source:"Compensation history"},
    {metric:"Attendance records",value:data.attendance.total,unit:"Records",period:`Last ${filters.months} months`,source:"Attendance ledger"},
    {metric:"Attendance anomalies",value:data.anomalies.length,unit:"Records",period:"Latest model run",source:data.model?.version??"No model run"},
  ];
  async function exportExcel(){await exportRecordsToExcel(`hr-analytics-${data.generatedAt.slice(0,10)}`,"HR Analytics",analyticsExportColumns,rows);toast.success("Live analytics exported to Excel");}
  const insight=data.anomalies.length?`${data.anomalies.length} attendance anomalies exceed the 70% review threshold in the latest model run.`:data.drivers.overtime>0?`Overtime contributes ${formatCurrency(data.drivers.overtime)} to the latest payroll run.`:"No material attendance anomaly or overtime signal is available in the current scope.";

  return <div aria-busy={pending||scoring}>
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500"><span>Payroll & Benefits</span><ChevronRight className="size-3.5 text-slate-300" /><span className="text-slate-700">HR Analytics</span></nav>
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex items-center gap-2.5"><h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">HR Analytics</h1><span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Live data</span></div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Reporting calculated from saved payroll, employee, compensation, benefit, attendance, and model records.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={()=>{downloadRecordsAsCsv(`hr-analytics-${data.generatedAt.slice(0,10)}`,analyticsExportColumns,rows);toast.success("Live analytics downloaded");}}><Download />Download</Button><Button variant="secondary" onClick={exportExcel}><FileSpreadsheet />Export Excel</Button><Button onClick={()=>update(filters,true)} disabled={pending||scoring}><RefreshCw className={pending?"animate-spin":""} />{pending?"Refreshing…":"Refresh data"}</Button></div></div>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><p role="status" className="text-xs text-slate-500">{scoring?"AI attendance analysis is running automatically…":scoringStatus||"AI attendance analysis checks for changes when you open this page."}</p><span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700"><ShieldCheck className="size-3.5" />Confidential · aggregated · MFA/RBAC protected</span></div>
    <p className="mt-2 max-w-3xl text-[11px] leading-5 text-slate-400">Individual salary amounts are not displayed in HR Analytics. Payroll data is transmitted over TLS, protected by Supabase encryption at rest, and restricted by database row-level security.</p>
    {error&&<p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <section aria-label="Analytics filters" className="mt-6 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-end gap-3"><div className="mr-1 hidden size-9 place-items-center rounded-lg bg-slate-50 text-slate-500 lg:grid"><SlidersHorizontal className="size-4" /></div><SelectFilter label="Date range" icon={CalendarDays} value={String(filters.months)} onChange={(value)=>update({...filters,months:Number(value) as 3|6|12})}><option value="12">Last 12 months</option><option value="6">Last 6 months</option><option value="3">Last 3 months</option></SelectFilter><SelectFilter label="Department" icon={Building2} value={filters.departmentId??""} onChange={(value)=>update({...filters,departmentId:value||null})}><option value="">All departments</option>{data.options.departments.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</SelectFilter><SelectFilter label="Location" icon={MapPin} value={filters.location??""} onChange={(value)=>update({...filters,location:value||null})}><option value="">All locations</option>{data.options.locations.map((item)=><option key={item}>{item}</option>)}</SelectFilter><SelectFilter label="Employment type" icon={UsersRound} value={filters.employmentType??""} onChange={(value)=>update({...filters,employmentType:value||null})}><option value="">All employees</option>{data.options.employmentTypes.map((item)=><option value={item} key={item}>{displayLabel(item)}</option>)}</SelectFilter><div className="ml-auto pb-0.5 text-xs text-slate-400">{data.summary.employeeCount} payroll employees in scope</div></div></section>

    <section aria-label="Key HR metrics" className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4"><KpiCard label="Gross payroll cost" value={compactMoney(data.summary.currentGross)} helper={period} icon={WalletCards} /><KpiCard label="Benefits cost" value={compactMoney(data.summary.currentBenefits)} helper="Latest payroll run" icon={HeartPulse} /><KpiCard label="Employer contributions" value={compactMoney(data.summary.currentContributions)} helper="Latest payroll run" icon={Coins} /><KpiCard label="Average compensation" value={compactMoney(data.summary.averageCompensation)} helper="Effective monthly base salary" icon={Banknote} /></section>

    <div key={`primary-${animationKey}`} className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.85fr)]"><section className="rounded-xl border border-slate-200 bg-white p-5"><ChartHeader title="Payroll cost trend" description="Live gross payroll by payment month" legend={[{label:"Gross payroll",color:"#4f46e5"}]} /><PayrollTrendChart data={data.trend} /></section><section className="rounded-xl border border-slate-200 bg-white p-5"><ChartHeader title="Compensation by department" description="Active payroll employees and effective monthly base salary" /><DepartmentBars data={data.departments} /></section></div>
    <div key={`secondary-${animationKey}`} className="mt-6 grid gap-6 xl:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><ChartHeader title="Total people cost" description="Latest payroll composition" /><CostMix data={data.costMix} /></section><section className="rounded-xl border border-slate-200 bg-white p-5"><ChartHeader title="Compensation distribution" description="Effective monthly salary bands" legend={[{label:"Employees",color:"#0ea5e9"}]} /><CompensationDistribution data={data.compensationBands} /></section></div>
    <div key={`attendance-${animationKey}`}><AttendanceIntelligence data={data} /></div>

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]"><section className="rounded-xl border border-slate-200 bg-white p-5"><ChartHeader title="Current cost drivers" description="Values calculated from the current reporting scope" /><div className="mt-5 divide-y divide-slate-100">{[{label:"Overtime cost",value:formatCurrency(data.drivers.overtime),helper:"Latest payroll entries",icon:Clock3,tone:"bg-amber-50 text-amber-600"},{label:"Approved claims",value:formatCurrency(data.drivers.claims),helper:"Current calendar month",icon:CircleAlert,tone:"bg-sky-50 text-sky-600"},{label:"New hires",value:String(data.drivers.newHires),helper:"Last 30 days",icon:UsersRound,tone:"bg-indigo-50 text-indigo-600"}].map((item)=>{const Icon=item.icon;return <div className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0" key={item.label}><span className={`grid size-9 place-items-center rounded-lg ${item.tone}`}><Icon className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-slate-800">{item.label}</p><p className="text-xs text-slate-500">{item.helper}</p></div><p className="text-sm font-semibold text-slate-800">{item.value}</p></div>;})}</div></section><aside className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-white text-indigo-600"><Sparkles className="size-4" /></span><h2 className="text-sm font-semibold text-slate-900">Live analytics insight</h2></div><p className="mt-4 text-sm leading-6 text-slate-600">{insight}</p><Button variant="secondary" className="mt-4" asChild><Link href="/payroll-benefits/attendance">Review attendance details<ChevronRight /></Link></Button></aside></div>
    <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><RefreshCw className="size-3.5" />Snapshot generated {new Date(data.generatedAt).toLocaleString()} · system-owner accounts excluded</div>
  </div>;
}
