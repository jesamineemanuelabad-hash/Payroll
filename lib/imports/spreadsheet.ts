export type SpreadsheetValue = string | number | boolean | null;
export type SpreadsheetRow = Record<string, SpreadsheetValue>;

const aliases: Record<string, string> = {
  employeeid: "employee_number", employeenumber: "employee_number", employee: "employee_number",
  firstname: "first_name", lastname: "last_name", emailaddress: "email", phone: "phone",
  department: "department", position: "job_title", jobtitle: "job_title", role: "role",
  employmenttype: "employment_type", employmentstatus: "employment_status", status: "status",
  hiredate: "hired_at", facebiometrics: "face_biometrics", basesalary: "base_salary",
  salaryfrequency: "salary_frequency", sssnumber: "sss_number", philhealth: "philhealth_number",
  philhealthnumber: "philhealth_number", pagibig: "pagibig_number", pagibignumber: "pagibig_number",
  tin: "tin", attendancedate: "attendance_date", date: "attendance_date",
  timein: "time_in", timeout: "time_out", scheduledtimein: "scheduled_time_in",
  scheduledtimeout: "scheduled_time_out", workdaytype: "work_day_type", sourcereference: "source_reference",
  externalid: "external_id", periodstart: "period_start", periodend: "period_end", paydate: "pay_date",
  effectivefrom: "effective_from", effectiveto: "effective_to", payrollrunid: "payroll_run_id",
  effectivedate: "effective_date", reviewcycle: "review_cycle", cyclename: "review_cycle",
  currentsalary: "current_salary", proposedsalary: "proposed_salary", employeereceives: "proposed_salary",
  adjustmentreason: "justification", reason: "justification", justification: "justification", bonus: "bonus",
  expectedgross: "expected_gross", expecteddeductions: "expected_deductions", expectednet: "expected_net",
  notes: "notes",
};

const dateOnlyFields = new Set(["hired_at", "attendance_date", "period_start", "period_end", "pay_date", "effective_from", "effective_to", "effective_date"]);
const dateTimeFields = new Set(["time_in", "time_out"]);

export function canonicalHeader(value: unknown) {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return aliases[key] ?? raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeCell(field: string, value: unknown): SpreadsheetValue {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (dateOnlyFields.has(field)) return localDate(value);
    if (dateTimeFields.has(field)) {
      if (value.getFullYear() < 2000) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:${String(value.getSeconds()).padStart(2, "0")}`;
      return value.toISOString();
    }
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value).trim();
  return text || null;
}

export function rowsFromMatrix(matrix: unknown[][]): SpreadsheetRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(canonicalHeader);
  return matrix.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(header, cells[index])])) as SpreadsheetRow)
    .filter((row) => Object.values(row).some((value) => value !== null));
}

export function attendanceMinutes(input: {
  attendanceDate: string; timeIn?: string | null; timeOut?: string | null;
  scheduledTimeIn?: string | null; scheduledTimeOut?: string | null;
}) {
  const zone = "+08:00";
  const instant = (value: string | null | undefined, fallback: string) => {
    if (!value) return new Date(`${input.attendanceDate}T${fallback}:00${zone}`);
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return new Date(`${input.attendanceDate}T${value}${zone}`);
    const twelveHour = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (twelveHour) {
      let hour = Number(twelveHour[1]) % 12;
      if (twelveHour[4].toUpperCase() === "PM") hour += 12;
      return new Date(`${input.attendanceDate}T${String(hour).padStart(2, "0")}:${twelveHour[2]}:${twelveHour[3] ?? "00"}${zone}`);
    }
    return new Date(value);
  };
  const scheduledIn = instant(input.scheduledTimeIn, "09:00");
  const scheduledOut = instant(input.scheduledTimeOut, "18:00");
  const timeIn = input.timeIn ? instant(input.timeIn, "09:00") : null;
  const timeOut = input.timeOut ? instant(input.timeOut, "18:00") : null;
  if (!timeIn || !timeOut || Number.isNaN(timeIn.getTime()) || Number.isNaN(timeOut.getTime())) {
    return { workedMinutes: 0, lateMinutes: 0, undertimeMinutes: 0, overtimeMinutes: 0, absenceMinutes: 480, classification: "absent" };
  }
  const minutes = (later: Date, earlier: Date) => Math.max(0, Math.round((later.getTime() - earlier.getTime()) / 60000));
  const duration = minutes(timeOut, timeIn);
  const workedMinutes = Math.max(0, duration - (duration > 360 ? 60 : 0));
  const lateMinutes = minutes(timeIn, scheduledIn);
  const undertimeMinutes = minutes(scheduledOut, timeOut);
  const overtimeMinutes = minutes(timeOut, scheduledOut);
  const classification = overtimeMinutes > 0 ? "overtime" : lateMinutes > 0 ? "late" : "on_time";
  return { workedMinutes, lateMinutes, undertimeMinutes, overtimeMinutes, absenceMinutes: 0, classification };
}
