"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { readTodayAttendance, type TodayAttendanceSnapshot } from "@/app/actions/records";

const metrics = [
  { key: "present", label: "Present", tone: "bg-emerald-50 text-emerald-600" },
  { key: "late", label: "Late / Tardy", tone: "bg-amber-50 text-amber-600" },
  { key: "absent", label: "Absent", tone: "bg-rose-50 text-rose-600" },
  { key: "missingClockOut", label: "Missing Clock-Out", tone: "bg-slate-50 text-slate-600" },
] as const;

export function TodayAttendanceSummary({ configured }: { configured: boolean }) {
  const [snapshot, setSnapshot] = useState<TodayAttendanceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(configured);

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
      <p className="mt-3 text-xs leading-5 text-slate-500">Summary counts are based on today’s saved attendance for active payroll employees. Employees without an attendance entry are not counted absent.</p>
    </>}
  </section>;
}
