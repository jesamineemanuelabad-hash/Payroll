"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient, hasSupabaseAdminEnvironment } from "@/lib/supabase/admin";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { attendanceMinutes, type SpreadsheetRow } from "@/lib/imports/spreadsheet";

const importEntities = ["profiles", "attendance_records", "payroll_runs", "employee_compensation_history", "payroll_validation_cases", "compensation_reviews"] as const;
type ImportEntity = typeof importEntities[number];
type ImportError = { row: number; message: string };
export type ImportResult = { ok: true; data: { imported: number; updated: number; skipped: number; errors: ImportError[]; warnings: ImportError[] } } | { ok: false; message: string };

const inputSchema = z.object({
  entity: z.enum(importEntities),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1).max(1000),
}).strict();

const roles: Record<ImportEntity, string[]> = {
  profiles: ["super_admin", "hr_admin"],
  attendance_records: ["super_admin", "hr_admin", "payroll_manager"],
  payroll_runs: ["super_admin", "payroll_manager"],
  employee_compensation_history: ["super_admin", "hr_admin", "hr_manager", "payroll_manager"],
  payroll_validation_cases: ["super_admin", "payroll_manager"],
  compensation_reviews: ["super_admin", "hr_admin", "hr_manager", "payroll_manager"],
};

function text(row: SpreadsheetRow, key: string) {
  const value = row[key];
  return value === null || value === undefined ? "" : String(value).trim();
}
function amount(row: SpreadsheetRow, key: string) {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`${key.replaceAll("_", " ")} must be a number.`);
  return value;
}
function required(row: SpreadsheetRow, key: string) {
  const value = text(row, key);
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`);
  return value;
}
function normalizeStatus(value: string) {
  const status = value.toLowerCase().replace(/[ -]+/g, "_");
  if (["active", "on_leave", "terminated"].includes(status)) return status;
  return "active";
}
function normalizeFrequency(value: string) {
  const frequency = value.toLowerCase().replace(/[ -]+/g, "_");
  if (["monthly", "semi_monthly", "daily", "hourly"].includes(frequency)) return frequency;
  return "monthly";
}
function dbMessage(cause: unknown) {
  const error = cause as { message?: string; code?: string };
  if (error.code === "23505") return "This employee or period already exists with conflicting data.";
  if (error.code === "23514" || error.code === "22P02") return "A date, status, or amount is invalid.";
  return error.message || "The row could not be imported.";
}
function departmentCode(name: string) {
  const prefix = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 10) || "DEPT";
  return `${prefix}_${createHash("sha1").update(name).digest("hex").slice(0, 5).toUpperCase()}`.slice(0, 16);
}
function generatedEmployeeNumber(email: string) {
  return `HR2_${createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 12).toUpperCase()}`;
}
function validDate(value: string, label: string) {
  let normalized = value;
  const local = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (local) normalized = `${local[3]}-${local[1].padStart(2, "0")}-${local[2].padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw new Error(`${label} must use YYYY-MM-DD or M/D/YYYY.`);
  return normalized;
}
function attendanceInstant(date: string, value: string) {
  if (!value) return null;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return new Date(`${date}T${value}+08:00`).toISOString();
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[4].toUpperCase() === "PM") hour += 12;
    return new Date(`${date}T${String(hour).padStart(2, "0")}:${twelveHour[2]}:${twelveHour[3] ?? "00"}+08:00`).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Time in and time out must be valid Excel date/time or ISO values.");
  return parsed.toISOString();
}
function payrollPeriod(start: string, end: string) {
  const first = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`);
  const monthEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
  const sameMonth = first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth();
  if (!sameMonth || !((first.getUTCDate() === 1 && last.getUTCDate() === 15) || (first.getUTCDate() === 16 && last.getUTCDate() === monthEnd) || (first.getUTCDate() === 1 && last.getUTCDate() === monthEnd))) {
    throw new Error("Period must be the 1st–15th, 16th–month end, or a complete calendar month.");
  }
}

export async function importSpreadsheetRows(input: unknown): Promise<ImportResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a valid spreadsheet with no more than 1,000 data rows." };
  if (!hasSupabaseEnvironment() || !hasSupabaseAdminEnvironment()) return { ok: false, message: "Supabase URL and service-role key are required for controlled imports." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: session, error: sessionError } = await db.rpc("workspace_session", {});
    if (sessionError) return { ok: false, message: sessionError.message };
    const workspace = session as unknown as { roles?: string[]; authenticatorAssuranceLevel?: string; mfaRequired?: boolean; active?: boolean };
    if (!workspace.active || !workspace.roles?.some((role) => roles[parsed.data.entity].includes(role))) return { ok: false, message: "Your role cannot import these records." };
    if (workspace.mfaRequired && workspace.authenticatorAssuranceLevel !== "aal2") return { ok: false, message: "Complete multi-factor authentication before importing records." };

    const admin = createSupabaseAdminClient();
    const errors: ImportError[] = [];
    const warnings: ImportError[] = [];
    let imported = 0; let updated = 0; let skipped = 0;
    const rows = parsed.data.rows as SpreadsheetRow[];

    const employeeCache = new Map<string, { id: string; employee_number: string; email: string; is_system_owner: boolean }>();
    const { data: employees, error: employeesError } = await admin.from("profiles").select("id,employee_number,email,is_system_owner");
    if (employeesError) return { ok: false, message: dbMessage(employeesError) };
    for (const employee of employees ?? []) {
      const item = employee as { id: string; employee_number: string; email: string; is_system_owner: boolean };
      employeeCache.set(item.employee_number.toLowerCase(), item); employeeCache.set(item.email.toLowerCase(), item);
    }
    const resolveEmployee = (row: SpreadsheetRow) => {
      const key = (text(row, "employee_number") || text(row, "email")).toLowerCase();
      if (!key) throw new Error("Employee ID or email is required.");
      const employee = employeeCache.get(key);
      if (!employee || employee.is_system_owner) throw new Error(`Payroll employee ${key} was not found. Import Employees first.`);
      return employee;
    };

    const duplicateKeys = new Set<string>(); const seenKeys = new Set<string>();
    if (parsed.data.entity === "profiles") for (const row of rows) {
      const employeeKey = text(row, "employee_number") ? `number:${text(row, "employee_number").toLowerCase()}` : "";
      const emailKey = text(row, "email") ? `email:${text(row, "email").toLowerCase()}` : "";
      for (const key of [employeeKey, emailKey].filter(Boolean)) {
        if (seenKeys.has(key)) duplicateKeys.add(key); else seenKeys.add(key);
      }
    }

    const authUsersByEmail = new Map<string, string>();
    if (parsed.data.entity === "profiles") {
      for (let page = 1; page <= 50; page++) {
        const { data: users, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (error) return { ok: false, message: dbMessage(error) };
        for (const user of users.users) if (user.email) authUsersByEmail.set(user.email.toLowerCase(), user.id);
        if (users.users.length < 100) break;
      }
    }

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index]; const rowNumber = index + 2;
      try {
        if (parsed.data.entity === "profiles") {
          const sourceEmployeeNumber = required(row, "employee_number");
          const email = required(row, "email").toLowerCase();
          const employeeNumber = duplicateKeys.has(`number:${sourceEmployeeNumber.toLowerCase()}`) ? generatedEmployeeNumber(email) : sourceEmployeeNumber;
          if (employeeNumber !== sourceEmployeeNumber) warnings.push({ row: rowNumber, message: `Duplicate source Employee ID ${sourceEmployeeNumber} was replaced with stable ID ${employeeNumber}. Use the employee email when importing related attendance.` });
          if (duplicateKeys.has(`email:${email}`)) throw new Error(`Email ${email} is duplicated in this file.`);
          const firstName = required(row, "first_name"); const lastName = required(row, "last_name");
          const existingByNumber = employeeCache.get(employeeNumber.toLowerCase()); const existingByEmail = employeeCache.get(email);
          if (existingByNumber && existingByEmail && existingByNumber.id !== existingByEmail.id) throw new Error("Employee ID and email belong to different existing employees.");
          const existing = existingByNumber ?? existingByEmail;
          if (existing?.is_system_owner) throw new Error("The protected system owner cannot be changed by import.");
          let departmentId: string | null = null;
          const department = text(row, "department");
          if (department) {
            const code = departmentCode(department);
            const { data: savedDepartment, error } = await admin.from("departments").upsert({ name: department, code }, { onConflict: "code" }).select("id").single();
            if (error) throw error; departmentId = (savedDepartment as { id: string }).id;
          }
          let userId = existing?.id ?? authUsersByEmail.get(email); let createdAuth = false;
          if (!userId) {
            const { data: created, error } = await admin.auth.admin.createUser({ email, password: randomBytes(32).toString("base64url"), email_confirm: true, user_metadata: { source: "hr2_spreadsheet_import" } });
            if (error || !created.user) throw error ?? new Error("Unable to create the employee identity.");
            userId = created.user.id; createdAuth = true; authUsersByEmail.set(email, userId);
          }
          const profile = { id: userId, employee_number: employeeNumber, first_name: firstName, last_name: lastName, email, department_id: departmentId, job_title: required(row, "job_title"), location: text(row, "location") || null, employment_type: text(row, "employment_type").toLowerCase().replace(/[ -]+/g, "_") || "regular", employment_status: normalizeStatus(text(row, "employment_status") || text(row, "status")), hired_at: text(row, "hired_at") ? validDate(text(row, "hired_at"), "Hire date") : null, is_payroll_employee: true, is_system_owner: false };
          const { error } = await admin.from("profiles").upsert(profile, { onConflict: "id" });
          if (error) { if (createdAuth) await admin.auth.admin.deleteUser(userId); throw error; }
          const cacheValue = { id: userId, employee_number: employeeNumber, email, is_system_owner: false };
          employeeCache.set(employeeNumber.toLowerCase(), cacheValue); employeeCache.set(email, cacheValue);
          if (row.base_salary !== null && row.base_salary !== undefined && String(row.base_salary) !== "") {
            const salary = amount(row, "base_salary"); if (salary < 0) throw new Error("Base salary cannot be negative.");
            const effectiveFrom = validDate(text(row, "effective_from") || text(row, "hired_at") || new Date().toISOString().slice(0, 10), "Salary effective date");
            const { error: salaryError } = await admin.from("employee_compensation_history").upsert({ employee_id: userId, base_salary: salary, salary_frequency: normalizeFrequency(text(row, "salary_frequency")), effective_from: effectiveFrom, source: "ess", external_id: `HR2-${employeeNumber}-${effectiveFrom}` }, { onConflict: "employee_id,effective_from" });
            if (salaryError) throw salaryError;
          }
          if (existing) updated++; else imported++;
        } else if (parsed.data.entity === "attendance_records") {
          const employee = resolveEmployee(row); const attendanceDate = validDate(required(row, "attendance_date"), "Attendance date");
          const computed = attendanceMinutes({ attendanceDate, timeIn: text(row, "time_in") || null, timeOut: text(row, "time_out") || null, scheduledTimeIn: text(row, "scheduled_time_in") || null, scheduledTimeOut: text(row, "scheduled_time_out") || null });
          const payload = { employee_id: employee.id, external_id: text(row, "external_id") || `EXCEL-${employee.employee_number}-${attendanceDate}`, attendance_date: attendanceDate, scheduled_time_in: text(row, "scheduled_time_in") || "09:00", scheduled_time_out: text(row, "scheduled_time_out") || "18:00", time_in: attendanceInstant(attendanceDate, text(row, "time_in")), time_out: attendanceInstant(attendanceDate, text(row, "time_out")), worked_minutes: computed.workedMinutes, late_minutes: computed.lateMinutes, undertime_minutes: computed.undertimeMinutes, overtime_minutes: computed.overtimeMinutes, absence_minutes: computed.absenceMinutes, night_minutes: row.night_minutes ? amount(row, "night_minutes") : 0, work_day_type: text(row, "work_day_type") || "ordinary", classification: computed.classification, approved_leave: false, source_updated_at: new Date().toISOString() };
          const { data: prior } = await admin.from("attendance_records").select("id").eq("employee_id", employee.id).eq("attendance_date", attendanceDate).maybeSingle();
          const { error } = await admin.from("attendance_records").upsert(payload, { onConflict: "employee_id,attendance_date" }); if (error) throw error;
          if (prior) updated++; else imported++;
        } else if (parsed.data.entity === "payroll_runs") {
          const periodStart = validDate(required(row, "period_start"), "Period start"); const periodEnd = validDate(required(row, "period_end"), "Period end"); const payDate = validDate(required(row, "pay_date"), "Pay date"); payrollPeriod(periodStart, periodEnd);
          const { data: prior } = await admin.from("payroll_runs").select("id,status").eq("period_start", periodStart).eq("period_end", periodEnd).maybeSingle();
          if (prior && (prior as { status: string }).status !== "draft") throw new Error("Only an existing draft payroll run can be updated.");
          const payload = { period_start: periodStart, period_end: periodEnd, pay_date: payDate, status: "draft", created_by: auth.user.id };
          const { error } = await admin.from("payroll_runs").upsert(payload, { onConflict: "period_start,period_end" }); if (error) throw error;
          if (prior) updated++; else imported++;
        } else if (parsed.data.entity === "employee_compensation_history") {
          const employee = resolveEmployee(row); const effectiveFrom = validDate(required(row, "effective_from"), "Effective from"); const baseSalary = amount(row, "base_salary"); if (baseSalary < 0) throw new Error("Base salary cannot be negative.");
          const { data: prior } = await admin.from("employee_compensation_history").select("id").eq("employee_id", employee.id).eq("effective_from", effectiveFrom).maybeSingle();
          const { error } = await admin.from("employee_compensation_history").upsert({ employee_id: employee.id, base_salary: baseSalary, salary_frequency: normalizeFrequency(text(row, "salary_frequency")), effective_from: effectiveFrom, effective_to: text(row, "effective_to") ? validDate(text(row, "effective_to"), "Effective to") : null, source: "manual", external_id: text(row, "external_id") || `IMPORT-${employee.employee_number}-${effectiveFrom}` }, { onConflict: "employee_id,effective_from" }); if (error) throw error;
          if (prior) updated++; else imported++;
        } else if (parsed.data.entity === "payroll_validation_cases") {
          const employee = resolveEmployee(row); let runId = text(row, "payroll_run_id");
          if (!runId) { const start = validDate(required(row, "period_start"), "Period start"); const end = validDate(required(row, "period_end"), "Period end"); const { data: run } = await admin.from("payroll_runs").select("id").eq("period_start", start).eq("period_end", end).maybeSingle(); runId = (run as { id?: string } | null)?.id ?? ""; }
          if (!runId) throw new Error("A matching payroll run was not found. Import Payroll Runs first.");
          const { data: prior } = await admin.from("payroll_validation_cases").select("id").eq("payroll_run_id", runId).eq("employee_id", employee.id).maybeSingle();
          const { error } = await admin.from("payroll_validation_cases").upsert({ payroll_run_id: runId, employee_id: employee.id, source_reference: required(row, "source_reference"), expected_gross: amount(row, "expected_gross"), expected_deductions: amount(row, "expected_deductions"), expected_net: amount(row, "expected_net"), notes: text(row, "notes") || null, created_by: auth.user.id }, { onConflict: "payroll_run_id,employee_id" }); if (error) throw error;
          if (prior) updated++; else imported++;
        } else {
          const employee = resolveEmployee(row);
          const cycleReference = text(row, "cycle_id") || text(row, "review_cycle") || text(row, "cycle");
          if (!cycleReference) throw new Error("Review Cycle is required.");
          let cycleId = cycleReference; let cycleStatus = "";
          if (z.string().uuid().safeParse(cycleReference).success) {
            const { data: cycle, error } = await admin.from("compensation_cycles").select("id,status").eq("id", cycleReference).maybeSingle();
            if (error) throw error;
            if (!cycle) throw new Error(`Compensation cycle ${cycleReference} was not found.`);
            cycleStatus = (cycle as { status: string }).status;
          } else {
            const { data: cycles, error } = await admin.from("compensation_cycles").select("id,status").eq("name", cycleReference).limit(2);
            if (error) throw error;
            if (!cycles?.length) throw new Error(`Compensation cycle "${cycleReference}" was not found. Create the cycle first.`);
            if (cycles.length > 1) throw new Error(`More than one cycle is named "${cycleReference}". Use Cycle ID instead.`);
            cycleId = (cycles[0] as { id: string }).id; cycleStatus = (cycles[0] as { status: string }).status;
          }
          if (cycleStatus === "closed") throw new Error("Closed compensation cycles cannot receive new proposals.");
          const effectiveDate = validDate(required(row, "effective_date"), "Effective date");
          let currentSalary = text(row, "current_salary") ? amount(row, "current_salary") : Number.NaN;
          if (!Number.isFinite(currentSalary)) {
            const { data: history, error } = await admin.from("employee_compensation_history").select("base_salary").eq("employee_id", employee.id).lte("effective_from", effectiveDate).or(`effective_to.is.null,effective_to.gte.${effectiveDate}`).order("effective_from", { ascending: false }).limit(1).maybeSingle();
            if (error) throw error;
            if (!history) throw new Error("Current Salary is missing and no salary history was found for this employee.");
            currentSalary = Number((history as { base_salary: number }).base_salary);
          }
          const proposedSalary = amount(row, "proposed_salary"); const bonus = text(row, "bonus") ? amount(row, "bonus") : 0;
          if (currentSalary < 0 || proposedSalary < 0 || bonus < 0) throw new Error("Salary and bonus amounts cannot be negative.");
          const { data: prior } = await admin.from("compensation_reviews").select("id,status").eq("employee_id", employee.id).eq("cycle_id", cycleId).maybeSingle();
          if (prior && (prior as { status: string }).status !== "draft") throw new Error("An existing submitted proposal cannot be replaced by import.");
          const increasePercentage = currentSalary === 0 ? 0 : Math.round((proposedSalary / currentSalary - 1) * 100000) / 1000;
          const payload = { employee_id: employee.id, cycle_id: cycleId, current_salary: currentSalary, proposed_salary: proposedSalary, increase_percentage: increasePercentage, bonus, effective_date: effectiveDate, justification: required(row, "justification"), status: "draft" };
          const { error } = await admin.from("compensation_reviews").upsert(payload, { onConflict: "employee_id,cycle_id" }); if (error) throw error;
          if (prior) updated++; else imported++;
        }
      } catch (cause) { skipped++; errors.push({ row: rowNumber, message: dbMessage(cause) }); }
    }
    await admin.from("audit_logs").insert({ user_id: auth.user.id, action: "spreadsheet_import", entity_type: parsed.data.entity, entity_id: `batch-${Date.now()}`, new_values: { imported, updated, skipped, warnings: warnings.length, source_rows: rows.length } });
    revalidatePath("/", "layout");
    return { ok: true, data: { imported, updated, skipped, errors: errors.slice(0, 50), warnings: warnings.slice(0, 50) } };
  } catch (cause) { return { ok: false, message: dbMessage(cause) }; }
}
