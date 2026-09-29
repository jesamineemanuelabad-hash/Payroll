"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Search } from "lucide-react";
import { readAttendanceCalendar, readAttendanceForDate, readEmployeeAttendanceHistory, readTodayAttendance, type AttendanceDateRecord, type EmployeeAttendanceHistory, type TodayAttendanceSnapshot } from "@/app/actions/records";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const historyPageSize = 30;
const dateLogPageSize = 7;

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateLabel(value: string, options: Intl.DateTimeFormatOptions = { weekday: "long", year: "numeric", month: "long", day: "numeric" }) {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "Asia/Manila" }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function statusTone(status: string) {
  if (status === "late") return "bg-amber-50 text-amber-700";
  if (status === "absent") return "bg-rose-50 text-rose-700";
  if (status === "on_leave") return "bg-blue-50 text-blue-700";
  return "bg-emerald-50 text-emerald-700";
}

function AttendanceDetail({ record }: { record: AttendanceDateRecord }) {
  const items = [
    ["Attendance date", dateLabel(record.attendanceDate)],
    ["Clock-in", formatTime(record.timeIn)],
    ["Clock-out", formatTime(record.timeOut)],
    ["Worked time", formatMinutes(record.workedMinutes)],
    ["Late", formatMinutes(record.lateMinutes)],
    ["Undertime", formatMinutes(record.undertimeMinutes)],
    ["Overtime", formatMinutes(record.overtimeMinutes)],
    ["Absence", formatMinutes(record.absenceMinutes)],
    ["Night hours", formatMinutes(record.nightMinutes)],
    ["Work day", record.workDayType.replaceAll("_", " ")],
    ["Approved leave", record.approvedLeave ? "Yes" : "No"],
  ];

  return <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
    {items.map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>)}
  </dl>;
}

export function AttendanceHistoryCalendar({ configured }: { configured: boolean }) {
  const today = todayInManila();
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = today.split("-").map(Number);
    return new Date(year, monthNumber - 1, 1);
  });
  const [calendarCounts, setCalendarCounts] = useState<Record<string, number>>({});
  const [calendarError, setCalendarError] = useState("");
  const [calendarLoading, setCalendarLoading] = useState(configured);
  const [dateRecords, setDateRecords] = useState<AttendanceDateRecord[]>([]);
  const [dateError, setDateError] = useState("");
  const [dateLoading, setDateLoading] = useState(configured);
  const [roster, setRoster] = useState<TodayAttendanceSnapshot["records"]>([]);
  const [rosterError, setRosterError] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [datePage, setDatePage] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState<AttendanceDateRecord | null>(null);
  const [history, setHistory] = useState<EmployeeAttendanceHistory | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const monthFirst = dateKey(month);
  const monthLast = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const departments = [...new Map(roster.filter((employee) => employee.departmentId && employee.departmentName)
    .map((employee) => [employee.departmentId!, employee.departmentName!])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1]));
  const filteredDateRecords = dateRecords.filter((record) => {
    const query = employeeSearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || `${record.employeeName} ${record.employeeNumber}`.toLocaleLowerCase().includes(query);
    return matchesSearch && (!departmentId || record.departmentId === departmentId);
  });
  const datePageCount = Math.max(1, Math.ceil(filteredDateRecords.length / dateLogPageSize));
  const visibleDateRecords = filteredDateRecords.slice(datePage * dateLogPageSize, (datePage + 1) * dateLogPageSize);
  const days = useMemo(() => {
    const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: offset }, () => null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];
  }, [month]);

  useEffect(() => {
    let active = true;
    if (!configured) return () => { active = false; };
    void readTodayAttendance().then((result) => {
      if (!active) return;
      if (result.ok) {
        setRoster(result.data.records);
        setRosterError("");
      } else {
        setRosterError(result.message);
      }
    }).catch(() => {
      if (active) setRosterError("Unable to load employee department filters.");
    });
    return () => { active = false; };
  }, [configured, refreshVersion]);

  useEffect(() => {
    let active = true;
    if (!configured) return () => { active = false; };
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setCalendarLoading(true);
      setCalendarCounts({});
      try {
        const result = await readAttendanceCalendar({ from: monthFirst, to: monthLast });
        if (!active) return;
        if (result.ok) {
          setCalendarCounts(Object.fromEntries(result.data.map((entry) => [entry.date, entry.recordCount])));
          setCalendarError("");
        } else {
          setCalendarError(result.message);
        }
      } catch {
        if (active) setCalendarError("Unable to load the attendance calendar. Try again.");
      } finally {
        if (active) setCalendarLoading(false);
      }
    })();
    return () => { active = false; };
  }, [configured, monthFirst, monthLast, refreshVersion]);

  useEffect(() => {
    let active = true;
    if (!configured) return () => { active = false; };
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setDateLoading(true);
      setDateRecords([]);
      try {
        const result = await readAttendanceForDate(selectedDate);
        if (!active) return;
        if (result.ok) {
          setDateRecords(result.data);
          setDateError("");
        } else {
          setDateError(result.message);
        }
      } catch {
        if (active) setDateError("Unable to load attendance for this date. Try again.");
      } finally {
        if (active) setDateLoading(false);
      }
    })();
    return () => { active = false; };
  }, [configured, selectedDate, refreshVersion]);

  useEffect(() => {
    const refresh = () => setRefreshVersion((current) => current + 1);
    window.addEventListener("attendance-records-refresh", refresh);
    return () => window.removeEventListener("attendance-records-refresh", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedEmployee) return () => { active = false; };
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const result = await readEmployeeAttendanceHistory({ employeeId: selectedEmployee.employeeId, page: historyPage, size: historyPageSize });
        if (!active) return;
        if (result.ok) {
          setHistory((current) => historyPage === 0 ? result.data : current ? { ...result.data, records: [...current.records, ...result.data.records] } : result.data);
        } else {
          setHistoryError(result.message);
        }
      } catch {
        if (active) setHistoryError("Unable to load employee attendance history. Try again.");
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedEmployee, historyPage]);

  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(dateKey(new Date(next.getFullYear(), next.getMonth(), 1)));
    setDatePage(0);
  }

  function chooseDate(value: string) {
    setSelectedDate(value);
    setDatePage(0);
  }

  return <>
    <section aria-labelledby="attendance-history-calendar-title" className="overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
      <div className="border-b px-5 py-4">
        <h3 id="attendance-history-calendar-title" className="font-semibold text-slate-950">Historical Attendance Calendar</h3>
        <p className="mt-1 text-sm text-slate-500">Select a date to view attendance records. Dates with a dot have saved attendance.</p>
      </div>
      {!configured && <p className="p-5 text-sm text-slate-500">Connect the database to browse attendance history.</p>}
      {configured && <div className="grid items-start gap-5 p-4 lg:grid-cols-[minmax(260px,320px)_1fr] sm:p-5">
        <div className="rounded-xl border p-3">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><ChevronLeft className="size-4" /></button>
            <h4 className="text-sm font-semibold text-slate-800">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h4>
            <button type="button" aria-label="Next month" onClick={() => changeMonth(1)} className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-slate-500">
            {weekdays.map((day) => <span key={day} className="py-2">{day}</span>)}
            {days.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />;
              const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
              const count = calendarCounts[key] ?? 0;
              const selected = selectedDate === key;
              return <button key={key} type="button" aria-pressed={selected} aria-label={`${dateLabel(key, { month: "long", day: "numeric", year: "numeric" })}${count ? `, ${count} attendance records` : ""}`} onClick={() => chooseDate(key)} className={`relative mx-auto grid size-9 place-items-center rounded-lg text-sm transition ${selected ? "bg-indigo-600 font-semibold text-white" : "text-slate-700 hover:bg-indigo-50"}`}>
                {day}
                {count > 0 && <span aria-hidden="true" className={`absolute bottom-1 size-1 rounded-full ${selected ? "bg-white" : "bg-indigo-500"}`} />}
              </button>;
            })}
          </div>
          {calendarLoading && <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500"><LoaderCircle className="size-3 animate-spin" />Loading month…</p>}
          {calendarError && <p role="alert" className="mt-3 text-xs text-red-700">{calendarError}</p>}
        </div>
        <div className="flex min-h-[360px] min-w-0 flex-col rounded-xl border p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <h4 className="text-sm font-semibold text-slate-900">Attendance for {dateLabel(selectedDate)}</h4>
            <span className="shrink-0 text-xs text-slate-500">{dateLoading ? "Loading…" : `${filteredDateRecords.length} ${filteredDateRecords.length === 1 ? "record" : "records"}`}</span>
          </div>
          {dateError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{dateError}</p>}
          {!dateError && !dateLoading && dateRecords.length === 0 && <div className="flex min-h-48 flex-col items-center justify-center text-center">
            <Clock3 aria-hidden="true" className="mb-2 size-7 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No attendance records for this date</p>
            <p className="mt-1 text-xs text-slate-500">Choose another date on the calendar.</p>
          </div>}
          {dateRecords.length > 0 && <>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
              <label className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input aria-label="Search employee attendance logs" placeholder="Search employees..." value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setDatePage(0); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
              </label>
              <label className="relative">
                <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <select aria-label="Filter employee attendance by department" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setDatePage(0); }} className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                  <option value="">All Depts</option>
                  {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </label>
            </div>
            {rosterError && <p role="alert" className="mt-2 text-xs text-red-700">{rosterError}</p>}
            <div className="mt-2 max-h-[420px] min-h-[210px] flex-1 divide-y overflow-y-auto">
            {visibleDateRecords.map((record) => <article key={record.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <button type="button" onClick={() => { setHistory(null); setHistoryError(""); setHistoryPage(0); setSelectedEmployee(record); }} className="text-left text-sm font-semibold text-indigo-700 hover:text-indigo-900 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">{record.employeeName}</button>
                <p className="mt-0.5 text-xs text-slate-500">{record.employeeNumber}{record.departmentName ? ` · ${record.departmentName}` : ""}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
                <span className={`rounded-full px-2.5 py-1 font-medium ${statusTone(record.classification)}`}>{record.classification.replaceAll("_", " ")}</span>
                <span>{formatTime(record.timeIn)} → {formatTime(record.timeOut)}</span>
                <span className="font-medium text-slate-700">{formatMinutes(record.workedMinutes)}</span>
              </div>
            </article>)}
            {!filteredDateRecords.length && <p className="py-10 text-center text-sm text-slate-500">No employees match these filters.</p>}
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
              <p className="text-xs text-slate-500">
                {filteredDateRecords.length ? `${datePage * dateLogPageSize + 1}–${Math.min((datePage + 1) * dateLogPageSize, filteredDateRecords.length)} of ${filteredDateRecords.length}` : "0 results"}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" disabled={datePage === 0} onClick={() => setDatePage((page) => Math.max(0, page - 1))} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <span className="text-xs tabular-nums text-slate-500">{datePage + 1} / {datePageCount}</span>
                <button type="button" disabled={datePage + 1 >= datePageCount} onClick={() => setDatePage((page) => Math.min(datePageCount - 1, page + 1))} className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            </div>
          </>}
        </div>
      </div>}
    </section>

    <Dialog open={Boolean(selectedEmployee)} onOpenChange={(open) => { if (!open) { setSelectedEmployee(null); setHistory(null); setHistoryError(""); setHistoryPage(0); } }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{history?.employee?.employeeName ?? selectedEmployee?.employeeName ?? "Employee attendance history"}</DialogTitle>
        <DialogDescription>
          {history?.employee ? `${history.employee.employeeNumber}${history.employee.departmentName ? ` · ${history.employee.departmentName}` : ""} · ${history.totalCount} attendance records` : "Daily attendance records stored in the system"}
        </DialogDescription>
        {historyError && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{historyError}</p>}
        {!historyError && historyLoading && !history && <p className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Loading attendance history…</p>}
        {history && <>
          <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {history.records.map((record) => <article key={record.id} className="rounded-xl border px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(record.classification)}`}>{record.classification.replaceAll("_", " ")}</span>
                  <h4 className="text-sm font-semibold text-slate-800">{dateLabel(record.attendanceDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</h4>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Clock3 aria-hidden="true" className="size-3.5 text-emerald-600" />
                  <span>{formatTime(record.timeIn)} → {formatTime(record.timeOut)}</span>
                  <span className="font-semibold text-slate-800">{(record.workedMinutes / 60).toFixed(2)}h</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Late {formatMinutes(record.lateMinutes)} · Undertime {formatMinutes(record.undertimeMinutes)} · Overtime {formatMinutes(record.overtimeMinutes)}
              </p>
              {record.attendanceDate === selectedDate && selectedEmployee && <AttendanceDetail record={selectedEmployee} />}
            </article>)}
            {!history.records.length && <p className="py-8 text-center text-sm text-slate-500">No saved attendance history for this employee.</p>}
          </div>
          {history.records.length < history.totalCount && <button type="button" disabled={historyLoading} onClick={() => setHistoryPage((page) => page + 1)} className="mt-3 w-full rounded-lg border px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
            {historyLoading ? "Loading…" : `Load more (${history.totalCount - history.records.length} remaining)`}
          </button>}
        </>}
        <p className="mt-3 text-xs text-slate-500">This is the saved daily attendance history. Raw biometric device punch events are not currently stored here.</p>
      </DialogContent>
    </Dialog>
  </>;
}
