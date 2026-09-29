"use client";

import { useEffect, useState } from "react";
import { Building2, Clock3, LoaderCircle, Search } from "lucide-react";
import { readTodayAttendance, type TodayAttendanceSnapshot } from "@/app/actions/records";

const metrics = [
  { key: "present", label: "Present", tone: "bg-emerald-50 text-emerald-600" },
  { key: "late", label: "Late / Tardy", tone: "bg-amber-50 text-amber-600" },
  { key: "absent", label: "Absent", tone: "bg-rose-50 text-rose-600" },
  { key: "missingClockOut", label: "Missing Clock-Out", tone: "bg-slate-50 text-slate-600" },
] as const;

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function TodayAttendanceSummary({ configured }: { configured: boolean }) {
  const [snapshot, setSnapshot] = useState<TodayAttendanceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(configured);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");

  useEffect(() => {
    let active = true;
    if (!configured) return () => { active = false; };
    const load = () => {
      void readTodayAttendance().then((result) => {
        if (!active) return;
        if (result.ok) {
          setSnapshot(result.data);
          setError("");
        } else {
          setError(result.message);
        }
      }).catch(() => {
        if (active) setError("Unable to load today's attendance. Try again.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    };
    load();
    window.addEventListener("attendance-records-refresh", load);
    return () => {
      active = false;
      window.removeEventListener("attendance-records-refresh", load);
    };
  }, [configured]);

  const allRecords = snapshot?.records ?? [];
  const departments = [...new Set(allRecords.map((record) => record.departmentName).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  const records = allRecords.filter((record) => {
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || `${record.employeeName} ${record.employeeNumber}`.toLocaleLowerCase().includes(query);
    return matchesSearch && (!department || record.departmentName === department);
  });
  const counts = {
    present: allRecords.filter((record) => record.timeIn !== null && record.classification !== "absent" && record.classification !== "on_leave").length,
    late: allRecords.filter((record) => record.classification === "late" || record.lateMinutes > 0).length,
    absent: allRecords.filter((record) => record.classification === "absent").length,
    missingClockOut: allRecords.filter((record) => record.timeIn !== null && record.timeOut === null && record.classification !== "absent" && record.classification !== "on_leave").length,
  };
  const trackedCount = allRecords.filter((record) => record.hasAttendance).length;
  const formattedDate = snapshot ? new Date(`${snapshot.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Attendance records for today";

  return <section aria-labelledby="today-attendance-title" className="rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 id="today-attendance-title" className="text-base font-semibold text-slate-950">Today’s Verified Attendance</h3>
        <p className="mt-0.5 text-sm text-slate-500">{formattedDate}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {loading && <LoaderCircle aria-label="Loading today's attendance" className="size-4 animate-spin text-slate-400" />}
        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{trackedCount} Tracked Records</span>
      </div>
    </div>
    {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!configured && <p className="p-5 text-sm text-slate-500">Connect the database to view today’s attendance.</p>}
    {configured && !error && <>
      <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {metrics.map(({ key, label, tone }) => <div key={key} className={`rounded-xl px-3 py-3 text-center sm:px-4 sm:py-3.5 ${tone}`}>
          <p className="text-2xl font-semibold leading-none tabular-nums">{loading && !snapshot ? "—" : counts[key]}</p>
          <p className="mt-1.5 text-xs text-slate-600">{label}</p>
        </div>)}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
        <label className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input aria-label="Filter by employee name" placeholder="Filter by name..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
        </label>
        <label className="relative">
          <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <select aria-label="Filter by department" value={department} onChange={(event) => setDepartment(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
            <option value="">All Depts</option>
            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Department</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Clock-in</th><th className="px-4 py-3 font-medium">Clock-out</th></tr></thead>
            <tbody>{records.map((record) => <tr key={record.id} className="border-t">
              <td className="px-4 py-3"><span className="font-medium text-slate-800">{record.employeeName}</span><span className="ml-2 text-xs text-slate-500">{record.employeeNumber}</span></td>
              <td className="px-4 py-3 text-slate-600">{record.departmentName ?? "—"}</td>
              <td className="px-4 py-3 capitalize text-slate-600">{displayStatus(record.classification)}</td>
              <td className="px-4 py-3 tabular-nums text-slate-600">{formatTime(record.timeIn)}</td>
              <td className="px-4 py-3 tabular-nums text-slate-600">{formatTime(record.timeOut)}</td>
            </tr>)}</tbody>
          </table>
          {!records.length && <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
            <Clock3 aria-hidden="true" className="mb-2 size-7 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">{loading ? "Loading attendance records…" : allRecords.length ? "No employees match this filter" : "No active employees were found"}</p>
            <p className="mt-0.5 text-xs text-slate-500">{allRecords.length ? "Adjust the name or department filter." : "Active payroll employees will appear here."}</p>
          </div>}
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Showing {records.length} of {snapshot?.expectedCount ?? 0} active payroll employees. Employees without an attendance entry are shown as “No record,” not counted absent.</p>
    </>}
  </section>;
}
