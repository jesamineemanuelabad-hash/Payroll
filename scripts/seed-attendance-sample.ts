import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const sampleAttendance = [
  { classification: "on_time", timeIn: "08:57", timeOut: "17:58", workedMinutes: 541, lateMinutes: 0, overtimeMinutes: 0, absenceMinutes: 0, approvedLeave: false },
  { classification: "late", timeIn: "09:24", timeOut: null, workedMinutes: 0, lateMinutes: 24, overtimeMinutes: 0, absenceMinutes: 0, approvedLeave: false },
  { classification: "absent", timeIn: null, timeOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, absenceMinutes: 480, approvedLeave: false },
  { classification: "overtime", timeIn: "08:51", timeOut: "19:42", workedMinutes: 600, lateMinutes: 0, overtimeMinutes: 102, absenceMinutes: 0, approvedLeave: false },
  { classification: "on_leave", timeIn: null, timeOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, absenceMinutes: 0, approvedLeave: true },
] as const;

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

function instantAtManila(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  if (process.env.ALLOW_ATTENDANCE_SAMPLE_SEED !== "true") {
    throw new Error("Attendance sample seeding is disabled. Set ALLOW_ATTENDANCE_SAMPLE_SEED=true for this one run.");
  }

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: administrators, error: administratorError } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");
  if (administratorError) throw new Error(`Unable to exclude system administrators from attendance: ${administratorError.message}`);
  const administratorIds = new Set((administrators ?? []).map((user) => user.user_id));
  const { data: employees, error: employeeError } = await admin
    .from("profiles")
    .select("id,employee_number")
    .eq("is_payroll_employee", true)
    .eq("is_system_owner", false)
    .eq("employment_status", "active")
    .order("employee_number");
  if (employeeError) throw new Error(`Unable to load existing active employees: ${employeeError.message}`);
  const roster = (employees ?? []).filter((employee) => !administratorIds.has(employee.id));
  if (!roster.length) throw new Error("No active payroll employees were found in public.profiles.");

  const date = todayInManila();
  const { data: existingAttendance, error: attendanceError } = await admin
    .from("attendance_records")
    .select("employee_id")
    .eq("attendance_date", date)
    .in("employee_id", roster.map((employee) => employee.id));
  if (attendanceError) throw new Error(`Unable to check today's existing attendance: ${attendanceError.message}`);
  const employeesWithAttendance = new Set((existingAttendance ?? []).map((record) => record.employee_id));
  const missingAttendance = roster.filter((employee) => !employeesWithAttendance.has(employee.id));
  if (!missingAttendance.length) {
    stdout.write(`All ${roster.length} active payroll employees already have attendance records for ${date} (Asia/Manila). No data was changed.\n`);
    return;
  }

  const hostname = new URL(url).hostname;
  stdout.write(`This will add varied sample attendance for ${missingAttendance.length} existing active payroll employee(s) without a record today in ${hostname}.\n`);
  stdout.write("Employee profiles and Auth users will not be created or changed. Existing attendance records will be left untouched.\n");
  stdout.write("Sample attendance can affect payroll if included in a payroll run. This is intended for capstone/demo data.\n");
  const prompt = createInterface({ input: stdin, output: stdout });
  const confirmation = await prompt.question('Type "seed missing attendance today" to continue: ');
  prompt.close();
  if (confirmation !== "seed missing attendance today") throw new Error("Attendance sample seed cancelled.");

  let written = 0;
  for (const [index, employee] of missingAttendance.entries()) {
    const sample = sampleAttendance[index % sampleAttendance.length];
    const timeIn = (time: string | null) => time ? instantAtManila(date, time) : null;
    const { error } = await admin.from("attendance_records").insert({
      employee_id: employee.id,
      external_id: `SAMPLE-ATT-${employee.employee_number}-${date}`,
      attendance_date: date,
      scheduled_time_in: "09:00",
      scheduled_time_out: "18:00",
      time_in: timeIn(sample.timeIn),
      time_out: timeIn(sample.timeOut),
      worked_minutes: sample.workedMinutes,
      late_minutes: sample.lateMinutes,
      overtime_minutes: sample.overtimeMinutes,
      absence_minutes: sample.absenceMinutes,
      approved_leave: sample.approvedLeave,
      classification: sample.classification,
      work_day_type: "ordinary",
      night_minutes: 0,
      source_updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Unable to add sample attendance for ${employee.employee_number}: ${error.message}`);
    written += 1;
    stdout.write(`Added sample ${sample.classification.replaceAll("_", " ")} attendance for ${employee.employee_number}.\n`);
  }

  stdout.write(`Finished for ${date} (Asia/Manila): added ${written} sample attendance record(s); ${employeesWithAttendance.size} existing record(s) were left unchanged.\n`);
  stdout.write("Sample records use external IDs prefixed SAMPLE-ATT- so they can be identified and removed later.\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Attendance sample seed failed.");
  process.exitCode = 1;
});
