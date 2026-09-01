"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  DatabaseZap,
  FileSpreadsheet,
  Fingerprint,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { CreatePayrollRunDialog } from "@/components/payroll/create-payroll-run-dialog";
import { MetricCard } from "@/components/shared/metric-card";
import { PayrollStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { downloadRecordsAsCsv, exportRecordsToExcel } from "@/lib/export-records";
import type { ExportRecord } from "@/types/operations";
import type { PayrollDashboardData, PayrollRun, PayrollStatus } from "@/types/payroll";

const statusOptions: { value: "all" | PayrollStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "processing", label: "Processing" },
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
];

const payrollExportColumns = [
  { key: "periodStart", label: "Period Start", width: 16, format: "date" as const }, { key: "periodEnd", label: "Period End", width: 16, format: "date" as const },
  { key: "payDate", label: "Pay Date", width: 16, format: "date" as const }, { key: "employees", label: "Employees", width: 12, format: "number" as const },
  { key: "grossPay", label: "Gross Pay", width: 18, format: "currency" as const }, { key: "deductions", label: "Deductions", width: 18, format: "currency" as const },
  { key: "contributions", label: "Employer Contributions", width: 22, format: "currency" as const }, { key: "netPay", label: "Net Pay", width: 18, format: "currency" as const },
  { key: "status", label: "Status", width: 18 },
];

function SortHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-1.5 whitespace-nowrap font-medium text-slate-500 hover:text-slate-800">{label}<ArrowUpDown className="size-3.5 text-slate-400" /></button>;
}

function RowActions({ run }: { run: PayrollRun }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for payroll ending ${run.periodEnd}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href={`/payroll-benefits/payroll/${run.id}`}><FileSpreadsheet />View payroll run</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.info("Payroll run duplicated", { description: "A new draft has been created in demo mode." })}><Copy />Duplicate as draft</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast.success("Recalculation queued", { description: "Employee totals will refresh when processing completes." })}><RefreshCw />Recalculate totals</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toast.info("Audit report prepared")}><ArrowDownToLine />Download audit report</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PayrollManagement({ data }: { data: PayrollDashboardData }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | PayrollStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDates, setShowDates] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: "periodStart", desc: true }]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.runs.filter((run) => {
      const period = `${format(parseISO(run.periodStart), "MMM d yyyy")} ${format(parseISO(run.periodEnd), "MMM d yyyy")}`.toLowerCase();
      return (!query || period.includes(query) || run.id.toLowerCase().includes(query)) &&
        (status === "all" || run.status === status) &&
        (!dateFrom || run.periodStart >= dateFrom) &&
        (!dateTo || run.periodEnd <= dateTo);
    });
  }, [data.runs, dateFrom, dateTo, search, status]);

  const columns = useMemo<ColumnDef<PayrollRun>[]>(() => [
    {
      accessorKey: "periodStart",
      header: ({ column }) => <SortHeader label="Payroll period" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />,
      cell: ({ row }) => (
        <div className="min-w-[170px]">
          <Link className="font-medium text-slate-900 hover:text-indigo-700 hover:underline" href={`/payroll-benefits/payroll/${row.original.id}`}>
            {format(parseISO(row.original.periodStart), "MMM d")}–{format(parseISO(row.original.periodEnd), "d, yyyy")}
          </Link>
          <p className="mt-0.5 text-xs text-slate-400">Updated {format(parseISO(row.original.updatedAt), "MMM d, h:mm a")}</p>
        </div>
      ),
    },
    { accessorKey: "payDate", header: ({ column }) => <SortHeader label="Pay date" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ getValue }) => <span className="whitespace-nowrap text-slate-700">{format(parseISO(getValue<string>()), "MMM d, yyyy")}</span> },
    { accessorKey: "employees", header: ({ column }) => <SortHeader label="Employees" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ getValue }) => <span className="tabular-nums text-slate-700">{getValue<number>().toLocaleString()}</span> },
    { accessorKey: "grossPay", header: ({ column }) => <SortHeader label="Gross pay" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-slate-700">{formatCurrency(getValue<number>())}</span> },
    { accessorKey: "deductions", header: "Deductions", cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-slate-600">{formatCurrency(getValue<number>())}</span> },
    { accessorKey: "contributions", header: "Employer contributions", cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums text-slate-600">{formatCurrency(getValue<number>())}</span> },
    { accessorKey: "netPay", header: ({ column }) => <SortHeader label="Net pay" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} />, cell: ({ getValue }) => <span className="whitespace-nowrap font-medium tabular-nums text-slate-900">{formatCurrency(getValue<number>())}</span> },
    { accessorKey: "status", header: "Status", cell: ({ getValue }) => <PayrollStatusBadge status={getValue<PayrollStatus>()} /> },
    { id: "actions", header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <RowActions run={row.original} /> },
  ], []);

  // TanStack Table intentionally returns stateful functions; React Compiler skips this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: filteredRuns, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 7 } } });

  function clearFilters() {
    setSearch(""); setStatus("all"); setDateFrom(""); setDateTo("");
  }

  const exportRows: ExportRecord[] = filteredRuns.map((run) => ({ periodStart: run.periodStart, periodEnd: run.periodEnd, payDate: run.payDate, employees: run.employees, grossPay: run.grossPay, deductions: run.deductions, contributions: run.contributions, netPay: run.netPay, status: run.status }));

  async function exportExcel() {
    await exportRecordsToExcel(`payroll-runs-${format(new Date(), "yyyy-MM-dd")}`, "Payroll Runs", payrollExportColumns, exportRows);
    toast.success("Payroll Excel file exported", { description: `${filteredRuns.length} payroll runs were included.` });
  }

  const hasFilters = Boolean(search || status !== "all" || dateFrom || dateTo);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500">
        <span>Payroll & Benefits</span><ChevronRight className="size-3.5 text-slate-300" /><span className="text-slate-700">Payroll Management</span>
      </nav>

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-[28px]">Payroll Management</h1>
            {data.isDemo && <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Demo data</span>}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Review payroll cycles, employee earnings, deductions, contributions, and payment status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={exportExcel}><FileSpreadsheet />Export Excel</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" aria-label="More payroll actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => toast.info("Payroll settings opened in demo mode")}><Settings2 />Payroll settings</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast.success("Registers are up to date")}><RefreshCw />Sync payroll registers</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { downloadRecordsAsCsv(`payroll-runs-${format(new Date(), "yyyy-MM-dd")}`, payrollExportColumns, exportRows); toast.success("Payroll records downloaded"); }}><ArrowDownToLine />Download CSV</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast.info("Audit report prepared")}><FileSpreadsheet />Generate audit report</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <CreatePayrollRunDialog />
        </div>
      </div>

      <section aria-label="Payroll summary" className="mt-6 grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:grid-cols-2 lg:grid-cols-5">
        {data.metrics.map((metric, index) => <MetricCard key={metric.label} metric={metric} index={index} />)}
      </section>

      <section aria-label="Payroll calculation readiness" className="mt-6 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_1px_2px_rgba(16,24,40,0.03)] md:grid-cols-2 xl:grid-cols-4">
        {[{ label: "Employee & salary records", helper: "248 records synchronized from ESS", icon: DatabaseZap }, { label: "Attendance adjustments", helper: "Late, undertime, absence, and OT calculated", icon: Fingerprint }, { label: "Statutory deductions", helper: "SSS, PhilHealth, Pag-IBIG, and tax ready", icon: ShieldCheck }, { label: "Benefits & reimbursements", helper: "12 approved items included", icon: CheckCircle2 }].map((item) => { const Icon = item.icon; return <div className="flex items-center gap-3 bg-white p-4" key={item.label}><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Icon className="size-4" /></span><div className="min-w-0"><p className="text-sm font-medium text-slate-800">{item.label}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.helper}</p></div></div>; })}
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Payroll runs</h2>
            <p className="mt-0.5 text-xs text-slate-500">All scheduled and completed payroll periods</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[210px] flex-1 sm:w-[260px] sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search payroll periods…" className="pl-9" aria-label="Search payroll runs" />
            </div>
            <div className="relative">
              <select value={status} onChange={(event) => setStatus(event.target.value as "all" | PayrollStatus)} className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 shadow-sm hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" aria-label="Filter by status">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            <Button variant={showDates ? "primary" : "secondary"} onClick={() => setShowDates((value) => !value)}><CalendarDays />Dates{(dateFrom || dateTo) && <span className="size-1.5 rounded-full bg-current" />}</Button>
          </div>
        </div>

        {showDates && (
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <label><span className="mb-1 block text-xs font-medium text-slate-600">Period begins after</span><Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-[170px] bg-white" /></label>
            <label><span className="mb-1 block text-xs font-medium text-slate-600">Period ends before</span><Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-[170px] bg-white" /></label>
            {(dateFrom || dateTo) && <Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }}><X />Clear dates</Button>}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
            <thead className="bg-slate-50/80">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => <th key={header.id} className="h-11 border-b border-slate-200 px-4 text-xs font-medium text-slate-500">{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>)}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length ? table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="group border-b border-slate-100 transition last:border-0 hover:bg-slate-50/70">
                  {row.getVisibleCells().map((cell) => <td key={cell.id} className="h-[68px] px-4 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
                </tr>
              )) : (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-16 text-center">
                    <span className="mx-auto grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500"><SlidersHorizontal className="size-5" /></span>
                    <h3 className="mt-3 text-sm font-semibold text-slate-900">No payroll runs match your filters</h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Try changing the payroll period, status, or search term.</p>
                    <Button className="mt-4" variant="secondary" onClick={clearFilters}>Clear filters</Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">Showing <span className="font-medium text-slate-700">{filteredRuns.length ? table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1 : 0}–{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, filteredRuns.length)}</span> of <span className="font-medium text-slate-700">{filteredRuns.length}</span></p>
            {hasFilters && <button className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700" onClick={clearFilters}><X className="size-3" />Clear filters</button>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft />Previous</Button>
            <span className="px-1 text-xs text-slate-500">Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
            <Button variant="secondary" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next<ChevronRight /></Button>
          </div>
        </div>
      </section>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        {data.runs.some((run) => run.status === "failed") ? <CircleAlert className="size-3.5 text-amber-500" /> : <CheckCircle2 className="size-3.5 text-emerald-500" />}
        Last synced {format(parseISO(data.lastUpdated), "MMM d, yyyy 'at' h:mm a")} · Amounts shown in Philippine pesos
      </div>
    </div>
  );
}
