"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { createSupabaseAdminClient, hasSupabaseAdminEnvironment } from "@/lib/supabase/admin";
import { entities, recordLabel, type RecordRow } from "@/lib/records/config";
import { recordSchema } from "@/lib/records/validation";
import type { Json } from "@/types/database";

type Result<T> = { ok: true; data: T } | { ok: false; message: string; fields?: Record<string, string[]> };
const requestSchema = z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), search: z.string().max(200).default(""), page: z.number().int().min(0).max(100000).default(0), size: z.number().int().min(1).max(1000).default(25), parent: z.string().uuid().optional(), id: z.string().uuid().optional() }).strict();

export async function resolveRecordLabels(input: unknown): Promise<Record<string, string>> {
  const parsed = z.array(z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), ids: z.array(z.string().uuid()).max(100) })).max(10).safeParse(input);
  if (!parsed.success || !hasSupabaseEnvironment()) return {};
  try {
    const db = await createSupabaseServerClient();
    const groups = await Promise.all(parsed.data.map(async ({ entity, ids }) => {
      const { data, error } = await db.rpc("lookup_records", { p_entity: entity, p_ids: ids });
      return error ? [] : (data as unknown as RecordRow[]).map((row) => [row.id, recordLabel(entity, row)]);
    }));
    return Object.fromEntries(groups.flat());
  } catch { return {}; }
}

function databaseMessage(error: { code?: string; message: string }) {
  if (error.code === "23505") return "A record with this reference or employee/period combination already exists.";
  if (error.code === "23503") return "A related record is missing or still references this record. Check the employee/Auth account, or deactivate the record instead of deleting it.";
  if (error.code === "42501") return "Your account does not have permission for this operation.";
  if (error.code === "22023" && /unknown record type/i.test(error.message)) {
    return "The database does not recognize position criteria yet. Apply migration 202610010002_credentials_record_workflows.sql, then refresh.";
  }
  if (error.code === "PGRST202" || error.code === "42P01") return "Database setup is incomplete. Apply all migrations, including 202609050001_record_crud.sql.";
  if (error.code === "23514" || error.code === "23502" || error.code === "22P02") return "Review required fields, dates, and amounts. The database rejected an invalid value.";
  return error.message;
}

export async function readRecords(input: unknown): Promise<Result<{ rows: RecordRow[]; count: number }>> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid record query." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the migrations to manage records. No data has been saved." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const value = parsed.data;
    const { data, error } = await db.rpc("list_records", { p_entity: value.entity, p_search: value.search, p_page: value.page, p_size: value.size, p_parent: value.parent, p_id: value.id });
    if (error) return { ok: false, message: databaseMessage(error) };
    return { ok: true, data: data as unknown as { rows: RecordRow[]; count: number } };
  } catch { return { ok: false, message: "Unable to reach the database. Try again." }; }
}

const departmentCardsSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  updatedAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  members: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    employeeNumber: z.string(),
  })),
}));

export type DepartmentCardData = z.infer<typeof departmentCardsSchema>[number];

export async function readDepartmentCards(): Promise<Result<DepartmentCardData[]>> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to view department summaries." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: rolesError } = await db.rpc("record_roles", {});
    if (rolesError) return { ok: false, message: databaseMessage(rolesError) };
    if (!roles?.some((role) => ["super_admin", "hr_admin"].includes(role))) {
      return { ok: false, message: "Only HR administrators can view department summaries." };
    }

    const { data, error } = await db.rpc("department_cards_snapshot", {});
    if (error) return { ok: false, message: error.code === "PGRST202" ? "Apply migration 202609300012_department_cards_snapshot.sql to enable department cards." : databaseMessage(error) };
    const parsed = departmentCardsSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: "Department summary data could not be read." };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, message: "Unable to load department summaries. Try again." };
  }
}

const compensationPlanningSchema = z.object({
  employees: z.array(z.object({
    id: z.string().uuid(),
    employeeNumber: z.string(),
    name: z.string(),
    department: z.string().nullable(),
    position: z.string(),
    positionId: z.string().uuid().nullable(),
    salaryAmount: z.number().nullable(),
    salaryFrequency: z.enum(["monthly", "semi_monthly", "daily", "hourly"]).nullable(),
    monthlySalary: z.number().nullable(),
    salaryMin: z.number().nullable(),
    salaryMax: z.number().nullable(),
    salaryMaxOpen: z.boolean().nullable(),
    credentials: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      issuingOrganization: z.string().nullable(),
      earnedOn: z.string().nullable(),
      expiresOn: z.string().nullable(),
      verificationStatus: z.enum(["pending", "verified", "rejected"]),
    })),
    criteria: z.array(z.object({
      id: z.string().uuid(),
      credentialName: z.string(),
      criterionType: z.enum(["required", "preferred"]),
      notes: z.string().nullable(),
    })),
  })),
  positions: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    department: z.string(),
  })),
  cycles: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    startsOn: z.string().date(),
    endsOn: z.string().date(),
    status: z.enum(["draft", "active"]),
  })),
});

export type CompensationPlanningSnapshot = z.infer<typeof compensationPlanningSchema>;

async function compensationAction<T>(rpc: "compensation_planning_snapshot" | "save_employee_credential" | "save_position_credential_criterion", args: Record<string, unknown>, schema: z.ZodType<T>): Promise<Result<T>> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply migration 202609300020_compensation_planning.sql before managing compensation planning." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: rolesError } = await db.rpc("record_roles", {});
    if (rolesError) return { ok: false, message: databaseMessage(rolesError) };
    if (!roles?.some((role) => ["super_admin", "hr_admin"].includes(role))) {
      return { ok: false, message: "Only HR administrators can manage compensation planning." };
    }
    const { data, error } = await db.rpc(rpc, args as never);
    if (error) return { ok: false, message: error.code === "PGRST202" ? "Apply migration 202609300020_compensation_planning.sql to enable compensation planning." : databaseMessage(error) };
    const parsed = schema.safeParse(data);
    if (!parsed.success) return { ok: false, message: "Compensation planning data could not be read. Check the compensation migration." };
    if (rpc !== "compensation_planning_snapshot") revalidatePath("/", "layout");
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, message: "Unable to reach the database. Try again." };
  }
}

export async function readCompensationPlanning(): Promise<Result<CompensationPlanningSnapshot>> {
  return compensationAction("compensation_planning_snapshot", {}, compensationPlanningSchema);
}

const savedCredentialSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  credential_name: z.string(),
});

export async function saveEmployeeCredential(input: unknown): Promise<Result<z.infer<typeof savedCredentialSchema>>> {
  const parsed = z.object({
    employeeId: z.string().uuid(),
    credentialName: z.string().trim().min(2).max(160),
    issuingOrganization: z.string().trim().max(160).nullable(),
    earnedOn: z.string().date().nullable(),
    expiresOn: z.string().date().nullable(),
    verificationStatus: z.enum(["pending", "verified", "rejected"]),
    notes: z.string().trim().max(1000).nullable(),
  }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid employee credential details." };
  const value = parsed.data;
  return compensationAction("save_employee_credential", {
    p_employee_id: value.employeeId,
    p_credential_name: value.credentialName,
    p_issuing_organization: value.issuingOrganization,
    p_earned_on: value.earnedOn,
    p_expires_on: value.expiresOn,
    p_verification_status: value.verificationStatus,
    p_notes: value.notes,
  }, savedCredentialSchema);
}

const savedCriterionSchema = z.object({
  id: z.string().uuid(),
  job_position_id: z.string().uuid(),
  credential_name: z.string(),
});

export async function savePositionCredentialCriterion(input: unknown): Promise<Result<z.infer<typeof savedCriterionSchema>>> {
  const parsed = z.object({
    positionId: z.string().uuid(),
    credentialName: z.string().trim().min(2).max(160),
    criterionType: z.enum(["required", "preferred"]),
    notes: z.string().trim().max(1000).nullable(),
  }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter valid position credential criteria." };
  const value = parsed.data;
  return compensationAction("save_position_credential_criterion", {
    p_job_position_id: value.positionId,
    p_credential_name: value.credentialName,
    p_criterion_type: value.criterionType,
    p_notes: value.notes,
  }, savedCriterionSchema);
}

const todayAttendanceSnapshotSchema = z.object({
  date: z.string().date(),
  expectedCount: z.number().int().nonnegative(),
  records: z.array(z.object({
    id: z.string().uuid(),
    employeeId: z.string().uuid(),
    employeeNumber: z.string(),
    employeeName: z.string(),
    departmentId: z.string().uuid().nullable(),
    departmentName: z.string().nullable(),
    classification: z.enum(["on_time", "late", "absent", "overtime", "on_leave", "no_record"]),
    timeIn: z.string().nullable(),
    timeOut: z.string().nullable(),
    lateMinutes: z.number().int().nonnegative(),
    hasAttendance: z.boolean(),
  })),
});

export type TodayAttendanceSnapshot = z.infer<typeof todayAttendanceSnapshotSchema>;

export async function readTodayAttendance(): Promise<Result<TodayAttendanceSnapshot>> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to view today's attendance." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("today_attendance_snapshot", {});
    if (error) {
      if (error.code === "PGRST202") return { ok: false, message: "Apply migration 202609290004_today_attendance_snapshot.sql to enable today's attendance." };
      return { ok: false, message: databaseMessage(error) };
    }
    const parsed = todayAttendanceSnapshotSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: "Today's attendance data could not be read. Check the attendance migration." };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, message: "Unable to load today's attendance. Try again." };
  }
}

const attendanceHistoryRecordSchema = z.object({
  id: z.string().uuid(),
  attendanceDate: z.string().date(),
  classification: z.enum(["on_time", "late", "absent", "overtime", "on_leave"]),
  timeIn: z.string().nullable(),
  timeOut: z.string().nullable(),
  workedMinutes: z.number().int().nonnegative(),
  lateMinutes: z.number().int().nonnegative(),
  undertimeMinutes: z.number().int().nonnegative(),
  overtimeMinutes: z.number().int().nonnegative(),
  absenceMinutes: z.number().int().nonnegative(),
  nightMinutes: z.number().int().nonnegative(),
  workDayType: z.string(),
  approvedLeave: z.boolean(),
});

export type AttendanceHistoryRecord = z.infer<typeof attendanceHistoryRecordSchema>;

const attendanceDateRecordSchema = attendanceHistoryRecordSchema.extend({
  employeeId: z.string().uuid(),
  employeeNumber: z.string(),
  employeeName: z.string(),
  departmentId: z.string().uuid().nullable(),
  departmentName: z.string().nullable(),
});

export type AttendanceDateRecord = z.infer<typeof attendanceDateRecordSchema>;

export async function readAttendanceCalendar(input: unknown): Promise<Result<Array<{ date: string; recordCount: number }>>> {
  const parsed = z.object({ from: z.string().date(), to: z.string().date() }).strict().safeParse(input);
  if (!parsed.success || parsed.data.from > parsed.data.to ||
    (Date.parse(`${parsed.data.to}T00:00:00Z`) - Date.parse(`${parsed.data.from}T00:00:00Z`)) / 86400000 > 42) {
    return { ok: false, message: "Invalid attendance calendar range." };
  }
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to view attendance history." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("attendance_calendar_month", { p_from: parsed.data.from, p_to: parsed.data.to });
    if (error) return { ok: false, message: error.code === "PGRST202" ? "Apply migration 202609290011_attendance_history_views.sql to enable the attendance calendar." : databaseMessage(error) };
    const result = z.array(z.object({ date: z.string().date(), recordCount: z.number().int().positive() })).safeParse(data);
    if (!result.success) return { ok: false, message: "Attendance calendar data could not be read." };
    return { ok: true, data: result.data };
  } catch {
    return { ok: false, message: "Unable to load the attendance calendar. Try again." };
  }
}

export async function readAttendanceForDate(input: unknown): Promise<Result<AttendanceDateRecord[]>> {
  const parsed = z.string().date().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid attendance date." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to view attendance records." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("attendance_records_for_date", { p_date: parsed.data });
    if (error) return { ok: false, message: error.code === "PGRST202" ? "Apply migration 202609290011_attendance_history_views.sql to view attendance by date." : databaseMessage(error) };
    const result = z.array(attendanceDateRecordSchema).safeParse(data);
    if (!result.success) return { ok: false, message: "Attendance records could not be read." };
    return { ok: true, data: result.data };
  } catch {
    return { ok: false, message: "Unable to load attendance for this date. Try again." };
  }
}

const employeeAttendanceHistorySchema = z.object({
  employee: z.object({
    id: z.string().uuid(),
    employeeNumber: z.string(),
    employeeName: z.string(),
    departmentName: z.string().nullable(),
  }).nullable(),
  totalCount: z.number().int().nonnegative(),
  records: z.array(attendanceHistoryRecordSchema),
});

export type EmployeeAttendanceHistory = z.infer<typeof employeeAttendanceHistorySchema>;

export async function readEmployeeAttendanceHistory(input: unknown): Promise<Result<EmployeeAttendanceHistory>> {
  const parsed = z.object({
    employeeId: z.string().uuid(),
    page: z.number().int().min(0).max(10000).default(0),
    size: z.number().int().min(1).max(100).default(30),
  }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid employee attendance history request." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to view attendance history." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data, error } = await db.rpc("employee_attendance_history", {
      p_employee_id: parsed.data.employeeId,
      p_page: parsed.data.page,
      p_size: parsed.data.size,
    });
    if (error) return { ok: false, message: error.code === "PGRST202" ? "Apply migration 202609290011_attendance_history_views.sql to view employee attendance history." : databaseMessage(error) };
    const result = employeeAttendanceHistorySchema.safeParse(data);
    if (!result.success) return { ok: false, message: "Employee attendance history could not be read." };
    if (!result.data.employee) return { ok: false, message: "This employee’s attendance history is not available to your account." };
    return { ok: true, data: result.data };
  } catch {
    return { ok: false, message: "Unable to load employee attendance history. Try again." };
  }
}

export async function saveRecord(input: unknown): Promise<Result<RecordRow>> {
  const parsed = z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), id: z.string().uuid().optional(), version: z.string().datetime({ offset: true }).optional(), values: z.record(z.string(), z.unknown()) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid record request." };
  const { entity, id, version, values } = parsed.data;
  if (entity === "profiles" && !id) return { ok: false, message: "Employees are owned by HR2. Use Sync with HR2 instead of creating an employee manually." };
  const validated = recordSchema(entity, !id).safeParse(values);
  if (!validated.success) return { ok: false, message: "Review the highlighted fields.", fields: validated.error.flatten().fieldErrors as Record<string, string[]> };
  return mutate(entity, id ? "update" : "create", validated.data as Json, id, version);
}

export async function deleteRecord(input: unknown): Promise<Result<RecordRow>> {
  const parsed = z.object({ entity: z.string().refine((key) => Object.hasOwn(entities, key)), id: z.string().uuid(), version: z.string().datetime({ offset: true }) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid delete request." };
  return mutate(parsed.data.entity, "delete", {}, parsed.data.id, parsed.data.version);
}

export async function uploadClaimReceipt(input: FormData): Promise<Result<{ url: string }>> {
  const employeeId = z.string().uuid().safeParse(input.get("employeeId"));
  const file = input.get("file");
  if (!employeeId.success || !(file instanceof File)) return { ok: false, message: "Select an employee and a supporting document." };
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    return { ok: false, message: "Upload a PDF, JPEG, or PNG no larger than 5 MB." };
  }
  if (!hasSupabaseEnvironment() || !hasSupabaseAdminEnvironment()) return { ok: false, message: "Configure Supabase administrator storage access before uploading a claim receipt." };

  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: databaseMessage(roleError) };
    if (!roles?.some((role) => entities.claims.roles.includes(role))) return { ok: false, message: "Your role cannot upload claim receipts." };

    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    const isJpeg = file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = file.type === "image/png" && bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
    if (!isPdf && !isJpeg && !isPng) return { ok: false, message: "The file contents do not match the selected PDF or image type." };

    const storage = createSupabaseAdminClient().storage;
    const { error: bucketError } = await storage.getBucket("claim-receipts");
    if (bucketError) {
      const { error: createBucketError } = await storage.createBucket("claim-receipts", {
        public: false,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
      });
      if (createBucketError) {
        const { error: retryBucketError } = await storage.getBucket("claim-receipts");
        if (retryBucketError) return { ok: false, message: `Private receipt storage is unavailable: ${createBucketError.message}` };
      }
    }
    const extension = isPdf ? "pdf" : isJpeg ? "jpg" : "png";
    const path = `${employeeId.data}/${crypto.randomUUID()}.${extension}`;
    const bucket = storage.from("claim-receipts");
    const { error: uploadError } = await bucket.upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) return { ok: false, message: uploadError.message };

    const { data: signed, error: signingError } = await bucket.createSignedUrl(path, 31536000);
    if (signingError || !signed?.signedUrl) {
      const { error: cleanupError } = await bucket.remove([path]);
      return { ok: false, message: cleanupError ? "Receipt was uploaded but its private link could not be created or cleaned up. Contact an administrator." : "A private receipt link could not be created. Try again." };
    }
    return { ok: true, data: { url: new URL(signed.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL).toString() } };
  } catch {
    return { ok: false, message: "Unable to upload the receipt. Check your connection and try again." };
  }
}

async function mutate(entity: string, operation: string, data: Json, id?: string, version?: string): Promise<Result<RecordRow>> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before saving records. Nothing was saved." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: databaseMessage(roleError) };
    if (!roles?.some((role) => entities[entity].roles.includes(role))) return { ok: false, message: "Your role cannot change these records." };
    const { data: saved, error } = await db.rpc("mutate_record", { p_entity: entity, p_operation: operation, p_data: data, p_id: id, p_version: version });
    if (error) return { ok: false, message: databaseMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, data: saved as unknown as RecordRow };
  } catch { return { ok: false, message: "Unable to save. Refresh the list to check whether the change completed before retrying." }; }
}

export type AuditEntry = { id: number; action: string; user_id: string | null; created_at: string; old_values: Json; new_values: Json };
export async function readRecordHistory(entity: string, id: string): Promise<Result<AuditEntry[]>> {
  if (!Object.hasOwn(entities, entity) || !z.string().uuid().safeParse(id).success) return { ok: false, message: "Invalid history request." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase to read history." };
  try {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("record_history", { p_entity: entity, p_id: id });
    return error ? { ok: false, message: databaseMessage(error) } : { ok: true, data: data as unknown as AuditEntry[] };
  } catch { return { ok: false, message: "Unable to load history." }; }
}
