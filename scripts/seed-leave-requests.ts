import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const applyChanges = process.argv.includes("--apply");
const leaveTypes = ["vawc", "emergency", "bereavement", "paternity", "annual", "unpaid", "maternity", "magna_carta_women", "calamity", "solo_parent", "vacation", "sick", "service_incentive", "other"] as const;

type Employee = { id: string; employee_number: string };
type ExistingRequest = { employee_id: string; leave_type: string; start_date: string };
type LeaveSeed = {
  employee_id: string;
  leave_type: (typeof leaveTypes)[number];
  start_date: string;
  end_date: string;
  total_days: number;
  is_paid: boolean;
  reason: string;
  status: "draft";
  rejection_reason: null;
};

function fail(message: string): never {
  throw new Error(message);
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addBusinessDays(start: Date, days: number) {
  const date = new Date(start);
  let remaining = days;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return date;
}

function nextBusinessDay(date: Date) {
  const next = new Date(date);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function leaveReason(type: (typeof leaveTypes)[number]) {
  const reasons: Record<(typeof leaveTypes)[number], string> = {
    vawc: "Requesting leave for personal and family safety matters.",
    emergency: "Requesting leave to attend to an urgent personal matter.",
    bereavement: "Requesting time away for a family bereavement.",
    paternity: "Requesting leave to support family responsibilities.",
    annual: "Requesting planned annual leave.",
    unpaid: "Requesting unpaid time away from work.",
    maternity: "Requesting maternity-related leave.",
    magna_carta_women: "Requesting leave under the applicable company leave policy.",
    calamity: "Requesting leave to attend to an emergency or calamity.",
    solo_parent: "Requesting leave for family responsibilities.",
    vacation: "Requesting planned vacation leave.",
    sick: "Requesting time away for health and recovery.",
    service_incentive: "Requesting service incentive leave.",
    other: "Requesting leave for a personal matter.",
  };
  return reasons[type];
}

async function seed() {
  if (!url || !serviceRoleKey) fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding leave requests.");

  const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const employees: Employee[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("profiles")
      .select("id,employee_number")
      .eq("employment_status", "active")
      .eq("is_payroll_employee", true)
      .eq("is_system_owner", false)
      .order("employee_number")
      .range(from, from + 999);
    if (error) fail(`Unable to read active employees: ${error.message}`);
    employees.push(...(data ?? []) as Employee[]);
    if (!data || data.length < 1000) break;
  }
  if (!employees.length) fail("No active payroll-eligible employees were found; no leave requests were written.");

  const existing: ExistingRequest[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("leave_requests")
      .select("employee_id,leave_type,start_date")
      .range(from, from + 999);
    if (error) fail(`Unable to inspect existing leave requests: ${error.message}`);
    existing.push(...(data ?? []) as ExistingRequest[]);
    if (!data || data.length < 1000) break;
  }
  const existingKeys = new Set(existing.map((row) => `${row.employee_id}|${row.leave_type}|${row.start_date}`));
  const targetCount = Math.max(1, Math.round(employees.length * 0.4));
  const selected = Array.from({ length: targetCount }, (_, index) => employees[Math.floor(index * employees.length / targetCount)]);
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + 14);
  const firstDay = nextBusinessDay(base);
  const seedRows = selected.map((employee, index): LeaveSeed => {
    const start = addBusinessDays(firstDay, index % 20);
    const days = 1 + (index % 3);
    const end = addBusinessDays(start, days - 1);
    const leaveType = leaveTypes[index % leaveTypes.length];
    return {
      employee_id: employee.id,
      leave_type: leaveType,
      start_date: dateOnly(start),
      end_date: dateOnly(end),
      total_days: days,
      is_paid: leaveType !== "unpaid",
      reason: leaveReason(leaveType),
      status: "draft",
      rejection_reason: null,
    };
  }).filter((row) => !existingKeys.has(`${row.employee_id}|${row.leave_type}|${row.start_date}`));

  const typeCounts = new Map<string, number>();
  for (const row of seedRows) typeCounts.set(row.leave_type, (typeCounts.get(row.leave_type) ?? 0) + 1);
  console.log(`Active payroll employees: ${employees.length}`);
  console.log(`Target requests: ${targetCount} (${(targetCount / employees.length * 100).toFixed(1)}% of active payroll employees)`);
  console.log(`New requests to ${applyChanges ? "insert" : "insert in apply mode"}: ${seedRows.length}; already present: ${targetCount - seedRows.length}`);
  console.log(`Requests will be inserted as drafts and then submitted; dates begin ${dateOnly(firstDay)}; unpaid leave type is marked unpaid.`);
  console.log(`Leave categories represented: ${[...typeCounts.entries()].map(([type, count]) => `${type} (${count})`).join(", ") || "none"}`);
  if (!applyChanges) {
    console.log("Dry run only. No database records were changed. Add --apply to insert the requests.");
    return;
  }
  if (!seedRows.length) {
    console.log("All target requests already exist; no changes made.");
    return;
  }

  const { data: inserted, error: insertError } = await db.from("leave_requests").insert(seedRows).select("id");
  if (insertError) fail(`Unable to seed leave requests. Apply migration 202610010007_expand_leave_types.sql first if the database rejects a leave type: ${insertError.message}`);
  const insertedIds = (inserted ?? []).map(({ id }) => id);
  if (insertedIds.length !== seedRows.length) {
    fail(`Inserted ${insertedIds.length} of ${seedRows.length} leave request drafts; refusing to report the seed as complete.`);
  }
  const { data: submitted, error: submitError } = await db.from("leave_requests")
    .update({ status: "submitted" })
    .in("id", insertedIds)
    .eq("status", "draft")
    .select("id");
  if (submitError) fail(`Inserted ${insertedIds.length} leave request drafts, but could not submit them: ${submitError.message}`);
  if ((submitted ?? []).length !== insertedIds.length) {
    fail(`Inserted ${insertedIds.length} leave request drafts, but only ${submitted?.length ?? 0} were submitted. Review the database before retrying.`);
  }
  console.log(`Inserted and submitted ${submitted?.length ?? 0} leave requests for existing active employees.`);
  console.log("HR can approve or reject submitted requests in Employee Management → Leave management. Approved paid leave is used the next time an overlapping draft payroll run is calculated.");
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Leave request seed failed.");
  process.exitCode = 1;
});
