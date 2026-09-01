import { ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, Clock3, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PayrollMetric } from "@/types/payroll";

export function MetricCard({ metric, index }: { metric: PayrollMetric; index: number }) {
  const indicator = metric.tone === "warning" ? Clock3 : metric.tone === "success" ? CheckCircle2 : index === 4 ? CalendarDays : null;
  const Indicator = indicator;
  const TrendIcon = metric.trend?.direction === "up" ? ArrowUpRight : metric.trend?.direction === "down" ? ArrowDownRight : Minus;

  return (
    <div className="min-w-0 border-r border-slate-200 px-4 py-4 first:pl-5 last:border-r-0 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-slate-500">{metric.label}</p>
        {Indicator && <Indicator className={cn("size-4", metric.tone === "warning" ? "text-amber-500" : metric.tone === "success" ? "text-emerald-500" : "text-slate-400")} />}
      </div>
      <p className="mt-2 truncate text-xl font-semibold tracking-[-0.025em] text-slate-950">{metric.value}</p>
      <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
        {metric.trend && (
          <span className={cn("flex items-center font-medium", metric.trend.direction === "up" ? "text-emerald-600" : "text-slate-500")}>
            <TrendIcon className="mr-0.5 size-3" />{metric.trend.value}
          </span>
        )}
        <span className="truncate">{metric.helper}</span>
      </div>
    </div>
  );
}
