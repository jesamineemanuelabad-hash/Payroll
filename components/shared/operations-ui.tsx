"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { downloadRecordsAsCsv, exportRecordsToExcel, type ExportColumn } from "@/lib/export-records";
import type { ExportRecord } from "@/types/operations";
import { synchronizeEssRecords } from "@/app/actions/integrations";

export function CompactMetric({ label, value, helper, icon: Icon, tone = "default" }: { label: string; value: string; helper: string; icon: typeof RefreshCw; tone?: "default" | "success" | "warning" | "danger" }) {
  const tones = { default: "bg-slate-50 text-slate-500", success: "bg-emerald-50 text-emerald-600", warning: "bg-amber-50 text-amber-600", danger: "bg-red-50 text-red-600" };
  return <div className="border-r border-slate-200 p-4 last:border-r-0 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-slate-500">{label}</p><span className={cn("grid size-8 place-items-center rounded-lg", tones[tone])}><Icon className="size-4" /></span></div><p className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">{value}</p><p className="mt-1.5 truncate text-xs text-slate-500">{helper}</p></div>;
}

export function RecordToolbar({ search, onSearch, placeholder, columns, records, fileName, sheetName, children }: { search: string; onSearch: (value: string) => void; placeholder: string; columns: ExportColumn[]; records: ExportRecord[]; fileName: string; sheetName: string; children?: React.ReactNode }) {
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    setExporting(true);
    try {
      await exportRecordsToExcel(fileName, sheetName, columns, records);
      toast.success("Excel file exported", { description: `${records.length} records were included.` });
    } catch {
      toast.error("Excel export failed", { description: "Try again or download the CSV version." });
    } finally {
      setExporting(false);
    }
  }
  return <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1 lg:max-w-[320px]"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={placeholder} className="pl-9" /></div><div className="flex flex-1 flex-wrap items-center gap-2">{children}<div className="ml-auto flex items-center gap-2"><Button variant="secondary" onClick={() => { downloadRecordsAsCsv(fileName, columns, records); toast.success("Records downloaded", { description: `${records.length} records were saved as CSV.` }); }}><Download />Download</Button><Button variant="secondary" onClick={exportExcel} disabled={exporting}>{exporting ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />}{exporting ? "Exporting…" : "Export Excel"}</Button></div></div></div>;
}

export function SyncButton({ label = "Sync with HR2", onSynced }: { label?: string; onSynced?: () => void }) {
  const [syncing, setSyncing] = useState(false);
  async function sync() {
    setSyncing(true);
    const result = await synchronizeEssRecords();
    setSyncing(false);
    if (!result.ok) { toast.error("HR2 synchronization failed", { description: result.message }); return; }
    onSynced?.();
    window.dispatchEvent(new Event("hr2-sync-complete"));
    toast.success("HR2 synchronization complete", { description: `${result.counts.employees} employees, ${result.counts.attendance.toLocaleString()} attendance records, and ${result.counts.approvedRequests} approved requests are now shown${result.demo ? " in demo mode" : ""}.` });
  }
  return <Button onClick={sync} disabled={syncing}>{syncing ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{syncing ? "Synchronizing…" : label}</Button>;
}

export function OperationsPageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <><nav aria-label="Breadcrumb" className="mb-3 text-xs font-medium text-slate-500">Payroll & Benefits <span className="mx-1.5 text-slate-300">/</span> <span className="text-slate-700">{eyebrow}</span></nav><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">{title}</h1><p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{description}</p></div>{actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div></>;
}

export function TableStatus({ label, tone }: { label: string; tone: "slate" | "blue" | "amber" | "green" | "red" | "indigo" }) {
  const tones = { slate: "bg-slate-100 text-slate-600", blue: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", indigo: "bg-indigo-50 text-indigo-700" };
  return <span className={cn("inline-flex h-6 items-center whitespace-nowrap rounded-md px-2 text-xs font-medium", tones[tone])}>{label}</span>;
}

export function EmployeeCell({ name, initials, secondary }: { name: string; initials: string; secondary: string }) {
  return <div className="flex min-w-[180px] items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-[10px] font-semibold text-indigo-700">{initials}</span><span><span className="block font-medium text-slate-900">{name}</span><span className="mt-0.5 block text-xs text-slate-400">{secondary}</span></span></div>;
}
