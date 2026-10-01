import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { calculateLeaveBalances } from "../lib/leave/balances";
import { entities, modules } from "../lib/records/config";
import { recordSchema } from "../lib/records/validation";
import { createPayrollRunSchema, getPayrollCutoffPeriod } from "../lib/validations/payroll";

const admin = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-000000000002";
const worker = "00000000-0000-4000-8000-000000000003";
const outsider = "00000000-0000-4000-8000-000000000004";
const systemAdmin = "00000000-0000-4000-8000-000000000006";
type Row = { id: string; updated_at: string; [key: string]: unknown };

test("payroll periods are generated for first and second monthly cutoffs", () => {
  assert.deepEqual(getPayrollCutoffPeriod("2026-09", "first"), { periodStart: "2026-09-01", periodEnd: "2026-09-15" });
  assert.deepEqual(getPayrollCutoffPeriod("2026-09", "second"), { periodStart: "2026-09-16", periodEnd: "2026-09-30" });
  assert.deepEqual(getPayrollCutoffPeriod("2024-02", "second"), { periodStart: "2024-02-16", periodEnd: "2024-02-29" });
  assert.equal(createPayrollRunSchema.safeParse({ periodStart: "2026-09-01", periodEnd: "2026-09-30", payDate: "2026-09-30", includeActiveEmployees: true }).success, false);
  assert.equal(createPayrollRunSchema.safeParse({ periodStart: "2026-09-16", periodEnd: "2026-09-30", payDate: "2026-09-30", includeActiveEmployees: true }).success, true);
});

test("server validation rejects invalid values and client-supplied protected fields", () => {
  assert.equal(recordSchema("payroll_runs", true).safeParse({ period_start: "2026-09-01", period_end: "2026-09-15", pay_date: "2026-09-15" }).success, true);
  assert.equal(recordSchema("payroll_runs", true).safeParse({ period_start: "2026-09-01", period_end: "2026-09-15", pay_date: "2026-09-20", total_net: 100 }).success, false);
  assert.equal(recordSchema("departments", true).safeParse({ name: "Finance", code: "fin" }).success, false);
  assert.equal(recordSchema("departments", true).safeParse({ name: "Finance", code: "FIN" }).success, true);
  assert.equal(recordSchema("leave_requests", true).safeParse({ employee_id: worker, leave_type: "bereavement", start_date: "2026-09-01", end_date: "2026-09-01", total_days: 1, is_paid: true, reason: "Family matter", status: "draft", rejection_reason: null }).success, true);
  assert.equal(recordSchema("leave_requests", true).safeParse({ employee_id: worker, leave_type: "unknown", start_date: "2026-09-01", end_date: "2026-09-01", total_days: 1, is_paid: true, reason: "Family matter", status: "draft", rejection_reason: null }).success, false);
});

test("leave management is beside Attendance in Employee Management and leave records are configured", () => {
  assert.deepEqual(modules.attendance, ["profiles", "attendance_records", "leave_requests", "departments"]);
  assert.ok(entities.leave_requests);
  assert.equal(entities.profiles.createNotice, undefined);
  assert.ok(entities.leave_requests.fields.some((field) => field.key === "is_paid"));
  assert.ok(entities.leave_requests.fields.find((field) => field.key === "leave_type")?.options?.includes("bereavement"));
  assert.deepEqual(modules.credentials, ["job_position_credential_criteria", "job_positions", "departments"]);
  assert.equal(entities.job_position_credential_criteria.title, "Position credentials");
});

test("leave balances use the shared annual paid-leave banks and refresh from approved usage", () => {
  const balances = calculateLeaveBalances([
    { leave_type: "vacation", start_date: "2026-03-02", total_days: 2, is_paid: true, status: "approved" },
    { leave_type: "service_incentive", start_date: "2026-05-04", total_days: 1, is_paid: true, status: "approved" },
    { leave_type: "annual", start_date: "2026-06-01", total_days: 3, is_paid: true, status: "submitted" },
    { leave_type: "sick", start_date: "2026-07-01", total_days: 2, is_paid: true, status: "approved" },
    { leave_type: "sick", start_date: "2026-08-01", total_days: 1, is_paid: false, status: "approved" },
    { leave_type: "vacation", start_date: "2025-12-20", total_days: 2, is_paid: true, status: "approved" },
  ], 2026);
  assert.deepEqual(balances, [
    { key: "vacation", label: "Vacation / annual leave", entitlement: 10, used: 3, remaining: 7 },
    { key: "sick", label: "Sick leave", entitlement: 10, used: 2, remaining: 8 },
  ]);
});

test("PostgreSQL CRUD, audit, authorization, and payroll consistency", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',nullif(current_setting('request.jwt.claim.sub',true),''),'role',nullif(current_setting('request.jwt.claim.role',true),''),'aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1'),'session_id',nullif(current_setting('request.jwt.claim.session_id',true),'')) $$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on function auth.uid() to authenticated,anon;
      alter default privileges in schema public grant all on tables to authenticated,anon;
      alter default privileges in schema public grant usage,select on sequences to authenticated;
    `);
    for (const file of ["202608280001_initial_payroll_benefits.sql", "202608300001_ess_attendance_analytics.sql", "202609050001_record_crud.sql", "202609060001_admin_bootstrap.sql", "202609060002_live_reporting.sql", "202609060003_payroll_engine.sql", "202609060004_account_settings.sql", "202609060005_rbac_management.sql", "202609060006_operational_workflows.sql", "202609060007_multi_factor_authentication.sql", "202609150001_automatic_attendance_scoring.sql", "202609190001_configurable_payroll_policy.sql", "202609220001_hr2_finance_workflows.sql", "202609230001_analytics_accuracy.sql", "202609290001_email_otp_mfa.sql", "202609290002_custom_email_otp.sql", "202609290003_remove_email_otp_hourly_limit.sql", "202609290004_today_attendance_snapshot.sql", "202609290005_today_active_employee_roster.sql", "202609290006_include_demo_employees_in_today_roster.sql", "202609290007_allow_nonpayroll_demo_attendance.sql", "202609290008_use_existing_payroll_employee_roster.sql", "202609290009_attendance_department_filters.sql", "202609290010_exclude_system_admins_from_attendance.sql", "202609290011_attendance_history_views.sql", "202609300012_department_cards_snapshot.sql", "202609300013_department_cards_simplify.sql", "202609300014_organization_position_catalog.sql", "202609300015_demo_employee_numbers_and_september_attendance.sql", "202609300016_hmo_benefits_management.sql", "202609300017_remove_unconfirmed_hmo_allocation.sql", "202609300018_hmo_salary_bands_and_budget_estimates.sql", "202609300019_hmo_provider_directory.sql", "202609300020_compensation_planning.sql", "202610010001_seed_demo_credentials.sql", "202610010002_credentials_record_workflows.sql", "202610010003_remove_demo_position_criteria.sql"]) {
      // PGlite includes gen_random_uuid in core, but not the optional pgcrypto extension.
      const sql = (await readFile(new URL(`../scripts/supabase/migrations/${file}`, import.meta.url), "utf8")).replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    const rejectionReasonMigration = await readFile(new URL("../scripts/supabase/migrations/202610010004_salary_proposal_rejection_reason.sql", import.meta.url), "utf8");
    await db.exec(rejectionReasonMigration);
    const simulationActorsMigration = await readFile(new URL("../scripts/supabase/migrations/202610010005_compensation_simulation_actors.sql", import.meta.url), "utf8");
    await db.exec(simulationActorsMigration);
    const payrollCalculationViewsMigration = await readFile(new URL("../scripts/supabase/migrations/202610010006_payroll_calculation_views.sql", import.meta.url), "utf8");
    await db.exec(payrollCalculationViewsMigration);
    const expandLeaveTypesMigration = await readFile(new URL("../scripts/supabase/migrations/202610010007_expand_leave_types.sql", import.meta.url), "utf8");
    await db.exec(expandLeaveTypesMigration);
    const claimReceiptsAndHmoPayrollMigration = await readFile(new URL("../scripts/supabase/migrations/202610010008_claim_receipts_and_hmo_payroll.sql", import.meta.url), "utf8");
    await db.exec(claimReceiptsAndHmoPayrollMigration);
    const financeHandoffAndHmoProviderMigration = await readFile(new URL("../scripts/supabase/migrations/202610010009_finance_handoff_and_hmo_package_providers.sql", import.meta.url), "utf8");
    await db.exec(financeHandoffAndHmoProviderMigration);
    const hrWorkforceAnalyticsMigration = await readFile(new URL("../scripts/supabase/migrations/202610010010_hr_workforce_analytics.sql", import.meta.url), "utf8");
    await db.exec(hrWorkforceAnalyticsMigration);
    const hrAnalyticsPasswordGateMigration = await readFile(new URL("../scripts/supabase/migrations/202610010011_hr_analytics_password_gate.sql", import.meta.url), "utf8");
    await db.exec(hrAnalyticsPasswordGateMigration);
    const missingAttendanceAbsenceMigration = await readFile(new URL("../scripts/supabase/migrations/202610010012_missing_attendance_as_weekday_absence.sql", import.meta.url), "utf8");
    await db.exec(missingAttendanceAbsenceMigration);
    await db.exec("grant all privileges on all tables in schema public to service_role");
    for (const id of [admin, reviewer, worker, outsider, systemAdmin]) {
      await db.query("insert into auth.users(id) values ($1)", [id]);
    }
    await db.exec("set role service_role");
    await db.query("select public.bootstrap_first_admin($1,'ADMIN','Admin','Test','admin@example.com')", [admin]);
    await assert.rejects(db.query("select public.bootstrap_first_admin($1,'SECOND','Second','Admin','second@example.com')", [outsider]), /already/);
    await db.exec("reset role");
    for (const [id, role, number] of [[reviewer, "hr_admin", "HR"], [worker, "employee", "EMP"], [outsider, "employee", "OTHER"]]) {
      await db.query("insert into public.profiles(id,employee_number,first_name,last_name,email,job_title) values ($1,$2,$2,'Test',$3,'Tester')", [id, number, `${number}@example.com`]);
      await db.query("insert into public.user_roles(user_id,role) values ($1,$2::public.app_role)", [id, role]);
    }
    async function as(user: string, emailVerified = true) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [user]);
      await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
      await db.exec("set role service_role");
      if (emailVerified) await db.query("select public.record_email_mfa_verification($1,$1)", [user]);
      else await db.query("update public.email_mfa_verifications set verified_at=now()-interval '13 hours',expires_at=now()-interval '1 second' where user_id=$1 and session_id=$1", [user]);
      await db.exec("reset role");
      await db.exec("set role authenticated");
    }
    async function create(entity: string, values: object) {
      const result = await db.query<{ value: Row }>("select public.mutate_record($1,'create',$2::jsonb) value", [entity, JSON.stringify(values)]);
      return result.rows[0].value;
    }
    async function update(entity: string, row: Row, values: object) {
      const result = await db.query<{ value: Row }>("select public.mutate_record($1,'update',$2::jsonb,$3,$4::timestamptz) value", [entity, JSON.stringify(values), row.id, row.updated_at]);
      return result.rows[0].value;
    }
    async function remove(entity: string, row: Row) {
      await db.query("select public.mutate_record($1,'delete','{}'::jsonb,$2,$3::timestamptz)", [entity, row.id, row.updated_at]);
    }
    async function read(entity: string, id?: string) {
      const result = await db.query<{ value: { rows: Row[]; count: number } }>("select public.list_records($1,'',0,25,null,$2) value", [entity, id ?? null]);
      return result.rows[0].value;
    }
    const created: Record<string, Row> = {};
    await t.test("custom email OTP expiry, cooldown, attempt limit, and single use", async () => {
      await db.exec("set role service_role");
      const issue = async (user: string, session: string, hash: string) =>
        (await db.query<{ status: string }>("select public.issue_login_email_otp($1,$2,$3) status", [user, session, hash])).rows[0].status;
      const verify = async (user: string, session: string, hash: string) =>
        (await db.query<{ status: string }>("select public.verify_login_email_otp($1,$2,$3) status", [user, session, hash])).rows[0].status;
      const correctHash = "a".repeat(64);
      const wrongHash = "b".repeat(64);

      assert.equal(await issue(admin, admin, correctHash), "issued");
      assert.equal(await issue(admin, admin, correctHash), "cooldown");
      assert.equal(await verify(admin, admin, wrongHash), "invalid");
      assert.equal(await verify(admin, admin, correctHash), "verified");
      assert.equal(await verify(admin, admin, correctHash), "invalid");

      assert.equal(await issue(reviewer, reviewer, correctHash), "issued");
      assert.equal(await verify(reviewer, worker, correctHash), "invalid");
      await db.query("update public.email_mfa_challenges set issued_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' where user_id=$1", [reviewer]);
      assert.equal(await verify(reviewer, reviewer, correctHash), "expired");

      assert.equal(await issue(worker, worker, correctHash), "issued");
      for (let attempt = 0; attempt < 5; attempt++) assert.equal(await verify(worker, worker, wrongHash), "invalid");
      assert.equal(await verify(worker, worker, wrongHash), "locked");
      assert.equal(await verify(worker, worker, correctHash), "locked");

      for (let send = 0; send < 7; send++) {
        await db.query("update public.email_mfa_send_limits set last_sent_at=now()-interval '61 seconds' where user_id=$1", [outsider]);
        assert.equal(await issue(outsider, outsider, correctHash), "issued");
      }
      await db.exec("reset role");
    });
    await t.test("today attendance snapshot returns today's authorized payroll records", async () => {
      await db.exec("set role service_role");
      await db.query("insert into public.profiles(id,employee_number,first_name,last_name,email,job_title,is_payroll_employee) values ($1,'SYSTEM-ADMIN','System','Admin','system-admin@example.com','System Administrator',true)", [systemAdmin]);
      await db.query("insert into public.user_roles(user_id,role) values ($1,'super_admin')", [systemAdmin]);
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query(
        "insert into public.attendance_records(employee_id,external_id,attendance_date,time_in,time_out,classification,late_minutes,source_updated_at) values ($1,'TODAY-LATE', (now() at time zone 'Asia/Manila')::date,now(),null,'late',12,now()),($2,'TODAY-ABSENT',(now() at time zone 'Asia/Manila')::date,null,null,'absent',0,now())",
        [worker, outsider],
      );
      await db.exec("reset role");
      await as(admin);
      const result = await db.query<{ value: { date: string; expectedCount: number; records: Array<{ employeeNumber: string; classification: string; timeIn: string | null; timeOut: string | null; hasAttendance: boolean; departmentName: string | null }> } }>(
        "select public.today_attendance_snapshot() value",
      );
      const snapshot = result.rows[0].value;
      assert.equal(snapshot.date, (await db.query<{ date: string }>("select (now() at time zone 'Asia/Manila')::date::text date")).rows[0].date);
      assert.equal(snapshot.expectedCount, 3);
      assert.ok(snapshot.records.every((record) => record.employeeNumber !== "SYSTEM-ADMIN"));
      assert.deepEqual(snapshot.records.map(({ employeeNumber, classification, timeIn, timeOut, hasAttendance, departmentName }) => ({ employeeNumber, classification, hasClockIn: timeIn !== null, hasClockOut: timeOut !== null, hasAttendance, departmentName })).sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber)), [
        { employeeNumber: "EMP", classification: "late", hasClockIn: true, hasClockOut: false, hasAttendance: true, departmentName: null },
        { employeeNumber: "HR", classification: "no_record", hasClockIn: false, hasClockOut: false, hasAttendance: false, departmentName: null },
        { employeeNumber: "OTHER", classification: "absent", hasClockIn: false, hasClockOut: false, hasAttendance: true, departmentName: null },
      ]);
      const day = snapshot.date;
      const calendar = await db.query<{ value: Array<{ date: string; recordCount: number }> }>("select public.attendance_calendar_month($1::date,$1::date) value", [day]);
      assert.deepEqual(calendar.rows[0].value, [{ date: day, recordCount: 2 }]);
      const daily = await db.query<{ value: Array<{ employeeNumber: string; workedMinutes: number; departmentId: string | null }> }>("select public.attendance_records_for_date($1::date) value", [day]);
      assert.deepEqual(daily.rows[0].value.map((record) => record.employeeNumber).sort(), ["EMP", "OTHER"]);
      assert.ok(daily.rows[0].value.every((record) => Number.isInteger(record.workedMinutes)));
      assert.ok(daily.rows[0].value.every((record) => record.departmentId === null));
      const history = await db.query<{ value: { employee: { employeeNumber: string }; totalCount: number; records: Array<{ attendanceDate: string }> } }>("select public.employee_attendance_history($1,0,30) value", [worker]);
      assert.equal(history.rows[0].value.employee.employeeNumber, "EMP");
      assert.equal(history.rows[0].value.totalCount, 1);
      assert.equal(history.rows[0].value.records[0].attendanceDate, day);
      await db.exec("set role service_role");
      await db.query("delete from public.attendance_records where external_id in ('TODAY-LATE','TODAY-ABSENT')");
      await db.query("delete from public.user_roles where user_id=$1 and role='super_admin'", [systemAdmin]);
      await db.query("delete from public.profiles where id=$1", [systemAdmin]);
      await db.exec("reset role");
      await db.query("delete from auth.users where id=$1", [systemAdmin]);
    });
    await t.test("privileged operations require session-bound email OTP", async () => {
      await as(admin, false);
      await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
      assert.equal((await db.query<{value:boolean}>("select public.current_user_requires_mfa() value")).rows[0].value,true);
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,false);
      await assert.rejects(db.query("select public.admin_access_snapshot('')"),/super administrator/i);
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("select public.record_email_mfa_verification($1,$1)", [admin]);
      await db.exec("reset role");
      await as(admin);
      await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,true);
      await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [reviewer]);
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,false);
      await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,false);
      await assert.rejects(db.query("select public.admin_access_snapshot('')"),/super administrator/i);
      await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [admin]);
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,true);
      await assert.doesNotReject(db.query("select public.admin_access_snapshot('')"));
    });
    await t.test("automatic scoring lease blocks duplicates and rejects unauthorized claims", async () => {
      const first=await db.query<{value:{status:string}}>("select public.claim_automatic_attendance_scoring() value");
      assert.equal(first.rows[0].value.status,"no_data");
      await db.exec("reset role");
      await db.query("update public.attendance_scoring_state set next_attempt_at=null where id=true");
      await as(worker);
      await assert.rejects(db.query("select public.claim_automatic_attendance_scoring()"),/role cannot run/i);
      await as(admin);
    });
    await t.test("system owner is protected and excluded from employee operations", async () => {
      const profile = await db.query<Row>("select * from public.profiles where id=$1", [admin]);
      assert.equal(profile.rows[0].is_system_owner, true);
      assert.equal(profile.rows[0].is_payroll_employee, false);
      assert.equal((await read("profiles", admin)).count, 0);
      await assert.rejects(remove("profiles", profile.rows[0]), /own profile|system owner/i);
      await assert.rejects(db.query("delete from public.user_roles where user_id=$1 and role='super_admin'", [admin]), /system owner|permission denied/i);
      await assert.rejects(create("attendance_records", { employee_id: admin, external_id: "OWNER-ATTENDANCE", attendance_date: "2026-09-01", classification: "on_time" }), /System accounts/);
      const account = await db.query<{value:{firstName:string;isSystemOwner:boolean;isPayrollEmployee:boolean}}>("select public.update_my_account_profile('Andrea','Admin','System Owner','Manila') value");
      assert.equal(account.rows[0].value.firstName,"Andrea");
      assert.equal(account.rows[0].value.isSystemOwner,true);
      assert.equal(account.rows[0].value.isPayrollEmployee,false);
    });
    await t.test("payroll policy is versioned and only a super administrator can configure it", async () => {
      const policy = { name:"Client validation policy",version:"CLIENT-TEST-v1",effectiveFrom:"2027-01-01",effectiveTo:"",status:"draft",workdaysPerMonth:26,hoursPerDay:8,ordinaryOtMultiplier:1.25,restDayOtMultiplier:1.69,specialDayOtMultiplier:1.69,regularHolidayOtMultiplier:2.6,doubleHolidayOtMultiplier:3.9,nightDifferentialRate:.1,contributionAllocation:"second_cutoff",comparisonTolerance:1,sssEmployeeRate:.05,sssEmployerRate:.10,sssMinMsc:5000,sssMaxMsc:35000,philhealthRate:.05,philhealthFloor:10000,philhealthCeiling:100000,pagibigLowRate:.01,pagibigHighRate:.02,pagibigEmployerRate:.02,pagibigRateThreshold:1500,pagibigSalaryCap:10000 };
      const saved=await db.query<{value:{version:string;workdays_per_month:number}}>("select public.save_payroll_policy($1::jsonb,null) value",[JSON.stringify(policy)]);
      assert.equal(saved.rows[0].value.version,"CLIENT-TEST-v1"); assert.equal(Number(saved.rows[0].value.workdays_per_month),26);
      const snapshot=await db.query<{value:Array<{version:string}>}>("select public.payroll_policy_snapshot() value");
      assert.ok(snapshot.rows[0].value.some((item)=>item.version==="CLIENT-TEST-v1"));
      await as(worker); await assert.rejects(db.query("select public.save_payroll_policy($1::jsonb,null)",[JSON.stringify({...policy,version:"DENIED"})]),/super administrator/i); await as(admin);
    });
    await t.test("create, list, update, and delete a department; stale edits and duplicate codes fail", async () => {
      const first = await create("departments", { name: "Finance", code: "FIN" });
      assert.equal((await read("departments", first.id)).rows[0].name, "Finance");
      const cards = await db.query<{ value: Array<{ id: string; name: string; code: string; memberCount: number; members: unknown[] }> }>("select public.department_cards_snapshot() value");
      assert.deepEqual(cards.rows[0].value.find((department) => department.id === first.id), {
        id: first.id,
        name: "Finance",
        code: "FIN",
        updatedAt: first.updated_at,
        memberCount: 0,
        members: [],
      });
      await as(worker);
      await assert.rejects(db.query("select public.department_cards_snapshot()"), /HR administrators/i);
      await as(admin);
      created.departments = await update("departments", first, { name: "Finance Operations" });
      await assert.rejects(update("departments", first, { name: "Lost update" }), /changed/);
      await assert.rejects(create("departments", { name: "Duplicate", code: "FIN" }), /unique/);
      const temporary = await create("departments", { name: "Temporary", code: "TMP" });
      await remove("departments", temporary);
      assert.equal((await read("departments", temporary.id)).count, 0);
    });
    await t.test("RBAC changes are atomic, scoped, audited, and protect the owner", async () => {
      const snapshot=await db.query<{value:{users:Array<{id:string}>;departments:Array<{id:string}>}}>("select public.admin_access_snapshot('') value");
      assert.ok(snapshot.rows[0].value.users.some(user=>user.id===admin));
      await db.query("select public.admin_update_user_access($1,array['hr_admin','manager'],array[$2]::uuid[],false,'active')",[reviewer,created.departments.id]);
      const roles=await db.query<{role:string}>("select role::text role from public.user_roles where user_id=$1 order by role::text",[reviewer]);
      assert.deepEqual(roles.rows.map(row=>row.role),["hr_admin","manager"]);
      assert.equal((await db.query("select 1 from public.manager_departments where manager_id=$1 and department_id=$2",[reviewer,created.departments.id])).rows.length,1);
      assert.equal((await db.query("select 1 from public.audit_logs where entity_type='access_control' and entity_id=$1",[reviewer])).rows.length,1);
      await assert.rejects(db.query("select public.admin_update_user_access($1,array['employee'],array[]::uuid[],true,'active')",[admin]),/system owner|administrative access/i);
      await db.query("select public.admin_update_user_access($1,array['hr_admin'],array[]::uuid[],true,'active')",[reviewer]);
      await db.query("select public.admin_update_user_access($1,array['employee'],array[]::uuid[],true,'terminated')",[outsider]);
      await as(outsider);
      assert.deepEqual((await db.query<{roles:string[]}>("select public.record_roles() roles")).rows[0].roles,[]);
      assert.equal((await db.query("select id from public.departments")).rows.length,0);
      await assert.rejects(create("claims",{employee_id:outsider,claim_number:"DISABLED",category:"meals",description:"Denied",amount:10,status:"draft"}),/role|access/i);
      await as(admin);
      await db.query("select public.admin_update_user_access($1,array['employee'],array[]::uuid[],true,'active')",[outsider]);
    });
    await t.test("manual employee creation is blocked while HR2-synchronized profiles remain editable", async () => {
      const id = "00000000-0000-4000-8000-000000000005";
      await db.exec("reset role");
      await db.query("insert into auth.users(id) values ($1)", [id]);
      await as(admin);
      await assert.rejects(create("profiles", { id, employee_number: "NEW", first_name: "New", last_name: "Employee", email: "new@example.com", job_title: "Analyst", department_id: created.departments.id }), /synchronized from HR2/i);
      await db.exec("reset role");
      const inserted=await db.query<Row>("insert into public.profiles(id,employee_number,first_name,last_name,email,job_title,department_id,is_payroll_employee) values ($1,'NEW','New','Employee','new@example.com','Analyst',$2,true) returning *",[id,created.departments.id]);
      const row=inserted.rows[0];
      await as(admin);
      const saved = await update("profiles", row, { job_title: "Senior Analyst" });
      assert.equal((await read("profiles", row.id)).rows[0].job_title, "Senior Analyst");
      await remove("profiles", saved);
      await db.exec("reset role");
      assert.equal((await db.query("select id from auth.users where id = $1", [id])).rows.length, 1);
      await as(admin);
    });
    await t.test("attendance and salary history persist, reject invalid time ordering and overlapping salaries", async () => {
      created.attendance_records = await create("attendance_records", { employee_id: worker, external_id: "MANUAL-1", attendance_date: "2026-09-01", classification: "on_time", time_in: "2026-09-01T01:00:00Z", time_out: "2026-09-01T10:00:00Z" });
      created.attendance_records = await update("attendance_records", created.attendance_records, { worked_minutes: 480 });
      assert.equal((await read("attendance_records")).rows[0].worked_minutes, 480);
      await assert.rejects(update("attendance_records", created.attendance_records, { time_out: "2026-08-31T10:00:00Z" }), /attendance_time_order/);
      created.employee_compensation_history = await create("employee_compensation_history", { employee_id: worker, base_salary: 30000, effective_from: "2026-09-01", effective_to: "2026-09-30" });
      await assert.rejects(create("employee_compensation_history", { employee_id: worker, base_salary: 40000, effective_from: "2026-09-20" }), /overlap/);
      created.employee_compensation_history = await update("employee_compensation_history", created.employee_compensation_history, { base_salary: 32000 });
      assert.equal((await read("employee_compensation_history")).rows[0].base_salary, 32000);
    });
    await t.test("scoring claims are leased and become current only after successful completion", async () => {
      const first=await db.query<{value:{status:string;token:string}}>("select public.claim_automatic_attendance_scoring() value");
      assert.equal(first.rows[0].value.status,"claimed");
      const token=first.rows[0].value.token;
      assert.equal((await db.query<{value:{status:string}}>("select public.claim_automatic_attendance_scoring() value")).rows[0].value.status,"busy");
      assert.equal((await db.query<{value:boolean}>("select public.finish_automatic_attendance_scoring($1,true) value",["00000000-0000-4000-8000-000000000099"])).rows[0].value,false);
      await assert.rejects(db.query("select public.finish_automatic_attendance_scoring($1,true)",[token]),/completed model run/i);
      const saved=await db.query<{id:string}>("insert into public.attendance_model_runs(model_version,feature_schema_version,period_start,period_end,records_scored,status,artifact_reference,completed_at,created_by) values ('test-v1','attendance-v1',current_date-30,current_date,1,'completed','https://model.example',now(),$1) returning id",[admin]);
      assert.equal((await db.query<{value:boolean}>("select public.finish_automatic_attendance_scoring($1,true,$2) value",[token,saved.rows[0].id])).rows[0].value,true);
      assert.equal((await db.query<{value:{status:string}}>("select public.claim_automatic_attendance_scoring() value")).rows[0].value.status,"up_to_date");
      created.attendance_records=await update("attendance_records",created.attendance_records,{late_minutes:15});
      assert.equal((await db.query<{value:{status:string}}>("select public.claim_automatic_attendance_scoring() value")).rows[0].value.status,"claimed");
      await db.exec("reset role");
      await db.query("update public.attendance_scoring_state set lease_token=null,lease_until=null where id=true");
      await as(admin);
    });
    await t.test("compensation cycles and draft proposals support CRUD", async () => {
      created.compensation_cycles = await create("compensation_cycles", { name: "Review", starts_on: "2026-09-01", ends_on: "2026-09-30", budget: 100000 });
      created.compensation_cycles = await update("compensation_cycles", created.compensation_cycles, { budget: 110000 });
      created.compensation_reviews = await create("compensation_reviews", { employee_id: worker, cycle_id: created.compensation_cycles.id, current_salary: 30000, proposed_salary: 33000, bonus: 0, effective_date: "2026-11-01", justification: "Planning", status: "draft" });
      created.compensation_reviews = await update("compensation_reviews", created.compensation_reviews, { proposed_salary: 36000 });
      assert.equal((await read("compensation_reviews")).rows[0].increase_percentage, 20);
    });
    await t.test("HR and Finance compensation workflow checks budget before implementation", async () => {
      const cycle=await create("compensation_cycles",{name:"Approved Review",starts_on:"2026-09-01",ends_on:"2026-09-30",budget:50000,status:"draft"});
      const proposal=await create("compensation_reviews",{employee_id:worker,cycle_id:cycle.id,current_salary:32000,proposed_salary:35000,bonus:1000,effective_date:"2026-10-01",justification:"Approved adjustment",status:"draft"});
      assert.equal(proposal.adjustment_amount,3000); assert.equal(proposal.within_budget,true);
      const pending=await update("compensation_reviews",proposal,{status:"pending"});
      await as(reviewer);
      const hrReview=await update("compensation_reviews",pending,{status:"hr_review"});
      const financeReview=await update("compensation_reviews",hrReview,{status:"finance_review"});
      await as(admin);
      await assert.rejects(update("compensation_reviews",financeReview,{status:"approved"}),/Finance approval and implementation are handled outside this system/i);
      await assert.rejects(update("compensation_reviews",financeReview,{status:"rejected"}),/Finance approval and implementation are handled outside this system/i);
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.exec("set role service_role");
      await db.query("update public.compensation_reviews set status='approved',approved_by=$2 where id=$1",[proposal.id,admin]);
      const implemented=await db.query<{applied_at:Date}>("update public.compensation_reviews set status='implemented' where id=$1 returning applied_at",[proposal.id]);
      assert.ok(implemented.rows[0].applied_at);
      await db.exec("reset role");
      await as(admin);
      const salary=await db.query<{base_salary:string;effective_from:Date;source:string}>("select base_salary,effective_from,source from public.employee_compensation_history where source_review_id=$1",[proposal.id]);
      assert.equal(Number(salary.rows[0].base_salary),35000);
      assert.equal(salary.rows[0].effective_from.toISOString().slice(0,10),"2026-10-01");
      assert.equal(salary.rows[0].source,"compensation_review");
    });
    await t.test("salary proposals require and retain rejection reasons", async () => {
      const cycle = await create("compensation_cycles", { name: "Rejection Review", starts_on: "2026-09-01", ends_on: "2026-09-30", budget: 50000, status: "draft" });
      const proposal = await create("compensation_reviews", { employee_id: worker, cycle_id: cycle.id, current_salary: 32000, proposed_salary: 34000, bonus: 0, effective_date: "2026-10-01", justification: "Test rejection workflow", status: "draft" });
      const pending = await update("compensation_reviews", proposal, { status: "pending" });
      await as(reviewer);
      const hrReview = await update("compensation_reviews", pending, { status: "hr_review" });
      await assert.rejects(update("compensation_reviews", hrReview, { status: "rejected" }), /rejection reason is required/i);
      const rejected = await update("compensation_reviews", hrReview, { status: "rejected", rejection_reason: "The supporting rationale needs revision." });
      assert.equal(rejected.rejection_reason, "The supporting rationale needs revision.");
      const simulationCycle = await create("compensation_cycles", { name: "Simulation actors", starts_on: "2026-09-01", ends_on: "2026-09-30", budget: 50000, status: "draft" });
      const simulationProposal = await create("compensation_reviews", {
        employee_id: worker,
        cycle_id: simulationCycle.id,
        current_salary: 32000,
        proposed_salary: 34000,
        bonus: 0,
        effective_date: "2026-10-01",
        justification: "[Workflow simulation] Test persona attribution.",
        status: "draft",
      });
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.role','service_role',false)");
      await db.exec("set role service_role");
      await db.query("update public.compensation_reviews set simulation_submitter='[Simulation] HR Submitter 1' where id=$1", [simulationProposal.id]);
      const simulationActor = await db.query<{ simulation_submitter: string }>("select simulation_submitter from public.compensation_reviews where id=$1", [simulationProposal.id]);
      assert.equal(simulationActor.rows[0].simulation_submitter, "[Simulation] HR Submitter 1");
      await assert.rejects(db.query("update public.compensation_reviews set simulation_submitter='Real-looking account' where id=$1", [simulationProposal.id]), /compensation_reviews_simulation_actors_labeled/);
      await db.exec("reset role");
      await as(admin);
    });
    await t.test("compensation planning records credentials and matches criteria to positions", async () => {
      await db.exec("set role service_role");
      const department = await db.query<{ id: string }>("insert into public.departments(name,code) values ('Operations','OPS') returning id");
      const position = await db.query<{ id: string }>("insert into public.job_positions(department_id,title,salary_min,salary_max) values ($1,'Tester',30000,50000) returning id", [department.rows[0].id]);
      await db.query("update public.profiles set department_id=$1 where id=$2", [department.rows[0].id, worker]);
      await db.exec("reset role");
      await as(admin);
      const credential = await db.query<{ value: { id: string; credential_name: string; verification_status: string } }>(
        "select public.save_employee_credential($1,'Forklift Operator Certificate','TESDA',current_date-30,null,'verified','Verified against submitted proof') value",
        [worker],
      );
      assert.equal(credential.rows[0].value.verification_status, "verified");
      const criterion = await db.query<{ value: { id: string; credential_name: string; criterion_type: string } }>(
        "select public.save_position_credential_criterion($1,'Forklift Operator Certificate','required','Current credential required') value",
        [position.rows[0].id],
      );
      assert.equal(criterion.rows[0].value.criterion_type, "required");
      const snapshot = await db.query<{
        value: {
          employees: Array<{
            id: string;
            positionId: string;
            credentials: Array<{ name: string; verificationStatus: string }>;
            criteria: Array<{ credentialName: string; criterionType: string }>;
          }>;
          cycles: Array<{ id: string; status: string }>;
        };
      }>(
        "select public.compensation_planning_snapshot() value",
      );
      const employee = snapshot.rows[0].value.employees.find((item) => item.id === worker);
      assert.ok(employee);
      assert.equal(employee.positionId, position.rows[0].id);
      assert.ok(employee.credentials.some((item) => item.name === "Forklift Operator Certificate" && item.verificationStatus === "verified"));
      assert.ok(employee.criteria.some((item) => item.credentialName === "Forklift Operator Certificate" && item.criterionType === "required"));
      assert.ok(snapshot.rows[0].value.cycles.some((item) => item.status === "draft"));
      const listedPositions = await read("job_positions");
      assert.ok(listedPositions.rows.some((item) => item.id === position.rows[0].id));
      const listedCriteria = await read("job_position_credential_criteria");
      assert.ok(listedCriteria.rows.some((item) => item.job_position_id === position.rows[0].id));
      const insertedCriterion = await create("job_position_credential_criteria", {
        job_position_id: position.rows[0].id,
        credential_name: "HR-created test criterion",
        criterion_type: "preferred",
        notes: "Created through the credentials workspace",
      });
      assert.ok(insertedCriterion.updated_at);
      assert.equal(insertedCriterion.created_by, admin);
      const updatedCriterion = await update("job_position_credential_criteria", insertedCriterion, { notes: "Updated through the credentials workspace" });
      assert.equal(updatedCriterion.notes, "Updated through the credentials workspace");
      await as(outsider);
      await assert.rejects(db.query("select public.compensation_planning_snapshot()"), /Only HR administrators/i);
      assert.equal((await read("job_position_credential_criteria")).count, 0);
      await assert.rejects(create("job_position_credential_criteria", {
        job_position_id: position.rows[0].id,
        credential_name: "Unauthorized",
        criterion_type: "preferred",
      }), /Your role cannot change these records/i);
      await as(admin);

      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.role','service_role',false)");
      await db.exec("set role service_role");
      await db.query("insert into public.departments(name,code) values ('Engineering','ENG')");
      const engineering = await db.query<{ id: string }>("select id from public.departments where code='ENG'");
      await db.query("insert into public.job_positions(department_id,title,salary_min) values ($1,'Senior Engineer',50000)", [engineering.rows[0].id]);
      const seedFunction = await db.query<{ function_name: string | null }>("select to_regprocedure('public.seed_demo_credentials()')::text as function_name");
      assert.equal(seedFunction.rows[0].function_name, null);
      await as(admin);
    });
    await t.test("benefit providers, all plan categories, and enrollments persist", async () => {
      created.benefit_providers = await create("benefit_providers", { name: "Test Provider" });
      created.benefit_providers = await update("benefit_providers", created.benefit_providers, { name: "Updated Provider" });
      created.benefit_plans = await create("benefit_plans", { provider_id: created.benefit_providers.id, name: "Medical", coverage_type: "employee_only", benefit_type: "HMO" });
      created.benefit_plans = await update("benefit_plans", created.benefit_plans, { employee_cost: 100, employer_cost: 200 });
      created.employee_benefits = await create("employee_benefits", { employee_id: worker, plan_id: created.benefit_plans.id, membership_number: "MEM-1", effective_date: "2026-09-01" });
      await assert.rejects(update("employee_benefits", created.employee_benefits, { status: "active" }), /eligibility/);
      created.employee_benefits = await update("employee_benefits", created.employee_benefits, { eligibility: "eligible", status: "active" });
      assert.equal((await read("employee_benefits")).rows[0].status, "active");
    });
    await t.test("Super Admin can link HMO package providers and manage enrollment", async () => {
      await as(admin);
      const initial = await db.query<{ value: { policy: { employerSharePercent: number }; packages: { id: string; tier: string; annualPremium: number | null; providerId: string | null; salaryMin: number; salaryMax: number | null; pricingBasis: string }[]; providers: { id: string; name: string; status: string; packageTiers: string[] }[]; employees: { id: string; eligible: boolean; status: string | null; currentMonthlySalary: number | null; recommendedPackageId: string | null }[] } }>(
        "select public.hmo_benefits_snapshot() value",
      );
      assert.deepEqual(initial.rows[0].value.packages.map((item) => item.tier), ["Executive", "Premium", "Standard Plus", "Standard"]);
      assert.ok(initial.rows[0].value.packages.every((item) => item.providerId === null && item.pricingBasis === "planning_estimate"));
      assert.deepEqual(initial.rows[0].value.packages.map((item) => [item.tier, item.annualPremium]), [
        ["Executive", 36000],
        ["Premium", 24000],
        ["Standard Plus", 12000],
        ["Standard", 6000],
      ]);
      const workerRecord = initial.rows[0].value.employees.find((item) => item.id === worker);
      assert.equal(workerRecord?.eligible, true);
      const currentSalary = await db.query<{ value: number }>(
        "select base_salary::float8 value from public.employee_compensation_history where employee_id=$1 and effective_from<=current_date and (effective_to is null or effective_to>=current_date) order by effective_from desc limit 1",
        [worker],
      );
      assert.equal(workerRecord?.currentMonthlySalary, currentSalary.rows[0].value);
      assert.equal(initial.rows[0].value.packages.find((item) => item.id === workerRecord?.recommendedPackageId)?.tier, "Standard Plus");
      assert.equal(initial.rows[0].value.policy.employerSharePercent, 100);
      assert.deepEqual(initial.rows[0].value.providers.map((provider) => provider.name), ["Intellicare", "Maxicare", "Updated Provider", "iCare"]);
      assert.ok(initial.rows[0].value.providers.every((provider) => provider.status === "active" && provider.packageTiers.length === 0));
      assert.equal(initial.rows[0].value.employees.find((item) => item.id === reviewer)?.eligible, false);
      const standardPlus = initial.rows[0].value.packages.find((item) => item.tier === "Standard Plus");
      const standard = initial.rows[0].value.packages.find((item) => item.tier === "Standard");
      const maxicare = initial.rows[0].value.providers.find((provider) => provider.name === "Maxicare");
      assert.ok(standardPlus);
      assert.ok(standard);
      assert.ok(maxicare);
      await db.query("select public.save_hmo_package_provider($1,$2)", [standard.id, maxicare.id]);
      const linked = await db.query<{ provider_id:string; name:string }>(
        "select tier.provider_id,provider.name from public.hmo_package_tiers tier join public.benefit_providers provider on provider.id=tier.provider_id where tier.id=$1",
        [standard.id],
      );
      assert.equal(linked.rows[0].provider_id, maxicare.id);
      assert.equal(linked.rows[0].name, "Maxicare");
      assert.equal(Number((await db.query<{ count:number }>("select count(*) count from public.audit_logs where entity_type='hmo_package_tiers' and entity_id=$1", [standard.id])).rows[0].count), 1);
      await db.query(
        "select public.save_hmo_enrollment($1,$2,'pending',null,null,null,null)",
        [worker, standardPlus.id],
      );
      const refreshed = await db.query<{ value: { employees: { id: string; packageId: string | null; status: string | null }[] } }>(
        "select public.hmo_benefits_snapshot() value",
      );
      const saved = refreshed.rows[0].value.employees.find((item) => item.id === worker);
      assert.equal(saved?.packageId, standardPlus.id);
      assert.equal(saved?.status, "pending");
      await assert.rejects(
        db.query("select public.save_hmo_enrollment($1,$2,'pending',null,null,null,null)", [worker, standard.id]),
        /salary-based HMO tier/,
      );
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("update public.profiles set is_payroll_employee=false where id=$1", [outsider]);
      await db.exec("reset role");
      await db.exec("set role authenticated");
      await assert.rejects(
        db.query("select public.save_hmo_enrollment($1,$2,'pending',null,null,null,null)", [outsider, standard.id]),
        /not eligible for the selected salary-based HMO tier/,
      );
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("update public.profiles set is_payroll_employee=true where id=$1", [outsider]);
      await db.exec("reset role");
      await as(admin);
    });
    await t.test("claims workflow hands off to Finance without approving or paying in-app", async () => {
      created.claims = await create("claims", { employee_id: worker, claim_number: "CLM-1", category: "medical", expense_date:"2026-09-02", description: "Receipt", requested_amount: 500, approved_amount: 0, status: "draft" });
      created.claims = await update("claims", created.claims, { requested_amount: 600 });
      const decision = await create("claims", { employee_id: worker, claim_number: "CLM-APPROVAL", category: "transportation", expense_date:"2026-09-03", description: "Company travel", requested_amount: 2500, approved_amount: 2000, status: "draft" });
      await assert.rejects(update("claims", decision, { status: "approved" }), /Invalid claim transition/);
      const pending = await update("claims", decision, { status: "pending" });
      await assert.rejects(update("claims", pending, { status: "finance_approval" }), /Invalid claim transition/);
      const reviewed = await update("claims", pending, { receipt_url: "https://example.com/receipt.pdf", verification_status: "verified", status: "under_review" });
      const finance = await update("claims", reviewed, { status: "finance_approval" });
      await assert.rejects(update("claims", finance, { status: "approved" }), /Finance approval and disbursement are handled outside this system/i);
      assert.equal(finance.status, "finance_approval");
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.exec("set role service_role");
      const financeDecision = await db.query<{ value: Row }>(
        "update public.claims set status='approved',amount=approved_amount,approved_at=now(),finance_approver_id=$2,finance_approved_at=now(),approver_id=$2,reviewer_id=$2,reviewed_at=now() where id=$1 returning to_jsonb(public.claims.*) value",
        [finance.id, admin],
      );
      const externallyApproved = financeDecision.rows[0].value;
      assert.equal(externallyApproved.approver_id, admin); assert.equal(externallyApproved.amount,2000); assert.equal(externallyApproved.requested_amount,2500);
      await db.exec("reset role");
      await as(admin);
      await assert.rejects(update("claims", externallyApproved, { status: "paid" }), /Finance approval and disbursement are handled outside this system/i);
      await assert.rejects(remove("claims", externallyApproved), /Only drafts|read-only/);
    });
    await t.test("payroll run/item CRUD calculates totals transactionally and rejects negative net", async () => {
      created.payroll_runs = await create("payroll_runs", { period_start: "2026-09-01", period_end: "2026-09-15", pay_date: "2026-09-20" });
      created.payroll_runs = await update("payroll_runs", created.payroll_runs, { pay_date: "2026-09-21" });
      created.payroll_items = await create("payroll_items", { payroll_run_id: created.payroll_runs.id, employee_id: worker, basic_salary: 1000, allowances: 100, overtime: 50, attendance_adjustments: -20, benefits: 10, reimbursements: 60, deductions: 200, contributions: 100 });
      let run = (await read("payroll_runs", created.payroll_runs.id)).rows[0];
      assert.equal(run.total_gross, 1200); assert.equal(run.total_net, 1000); assert.equal(run.employee_count, 1);
      await assert.rejects(update("payroll_items", created.payroll_items, { deductions: 9999 }), /Deductions/);
      await assert.rejects(remove("payroll_runs", run), /entries/);
      created.payroll_items = await update("payroll_items", created.payroll_items, { status: "excluded" });
      run = (await read("payroll_runs", created.payroll_runs.id)).rows[0];
      assert.equal(run.total_net, 0); assert.equal(run.employee_count, 0);
      created.payroll_items = await update("payroll_items", created.payroll_items, { status: "ready" });
    });
    await t.test("live reporting excludes the owner and persists validated model output", async () => {
      await as(admin);
      const snapshot = await db.query<{ value: { summary: { employeeCount: number; currentGross: number }; model: null | { recordsScored: number }; anomalies: unknown[] } }>("select public.dashboard_snapshot(12,null,null,null) value");
      assert.equal(snapshot.rows[0].value.summary.employeeCount, 3);
      assert.equal(snapshot.rows[0].value.summary.currentGross, 1200);
      await assert.rejects(db.query("select public.hr_analytics_snapshot(12,null,null,null)"), /password verification/i);
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("insert into public.hr_analytics_access_grants(user_id,session_id,verified_at,expires_at) values ($1,$1,now(),now()+interval '15 minutes')", [admin]);
      await as(admin);
      assert.equal((await db.query<{ value: boolean }>("select public.has_hr_analytics_access() value")).rows[0].value, true);
      await assert.rejects(db.query("select public.hr_analytics_snapshot_unlocked(12,null,null,null)"), /permission denied/i);
      const hrSnapshot = await db.query<{ value: { summary: { headcount: number; activeEmployees: number; newHires: number }; attendance: { total: number; classes: { classification: string; count: number }[] }; compensationBands: { label: string; count: number }[] } }>("select public.hr_analytics_snapshot(12,null,null,null) value");
      assert.equal(hrSnapshot.rows[0].value.summary.headcount, 3);
      assert.equal(hrSnapshot.rows[0].value.summary.activeEmployees, 3);
      assert.equal(hrSnapshot.rows[0].value.attendance.total, 1);
      assert.equal(hrSnapshot.rows[0].value.attendance.classes.reduce((total, item) => total + item.count, 0), 1);
      assert.equal(hrSnapshot.rows[0].value.compensationBands.reduce((total, band) => total + band.count, 0), 1);
      await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [reviewer]);
      await assert.rejects(db.query("select public.hr_analytics_snapshot(12,null,null,null)"), /password verification/i);
      await db.query("select set_config('request.jwt.claim.session_id',$1,false)", [admin]);
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("update public.hr_analytics_access_grants set verified_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where user_id=$1 and session_id=$1", [admin]);
      await as(admin);
      await assert.rejects(db.query("select public.hr_analytics_snapshot(12,null,null,null)"), /password verification/i);
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("update public.hr_analytics_access_grants set expires_at=now()+interval '15 minutes' where user_id=$1 and session_id=$1", [admin]);
      await as(admin);
      await assert.rejects(db.query("select public.hr_analytics_snapshot(4,null,null,null)"), /Invalid reporting range/i);
      const accuracy = await db.query<{ value: { coverage: { employees: number; attendanceRecords: number }; payroll: { totalDeductions: number } } }>("select public.analytics_accuracy_snapshot(12,null,null,null) value");
      assert.equal(accuracy.rows[0].value.coverage.employees, 3);
      assert.equal(accuracy.rows[0].value.coverage.attendanceRecords, 1);
      assert.equal(accuracy.rows[0].value.payroll.totalDeductions, 200);
      const features = await db.query<{ value: { attendanceRecordId: string }[] }>("select public.attendance_scoring_features('2026-08-01','2026-09-30') value");
      assert.equal(features.rows[0].value.length, 1);
      const predictions = [{ attendanceRecordId: features.rows[0].value[0].attendanceRecordId, classification: "late", classProbability: 0.94, anomalyScore: 0.82, anomalyReasons: ["Repeated late arrival"] }];
      await db.query("select public.save_attendance_predictions('2026-08-01','2026-09-30','test-v1',0.91,'https://model.example',$1::jsonb)", [JSON.stringify(predictions)]);
      const refreshed = await db.query<{ value: { model: { recordsScored: number; validationAccuracy: number }; anomalies: unknown[] } }>("select public.dashboard_snapshot(12,null,null,null) value");
      assert.equal(refreshed.rows[0].value.model.recordsScored, 1);
      assert.equal(refreshed.rows[0].value.model.validationAccuracy, 0.91);
      assert.equal(refreshed.rows[0].value.anomalies.length, 1);
    });
    await t.test("payroll engine itemizes late minutes, overtime, statutory deductions, paid leave, and payslips", async () => {
      await db.exec("set role service_role");
      await db.query(
        "update public.hmo_enrollments set status='active',membership_number='STD-EMP',effective_date='2026-09-01',expiration_date='2026-09-30' where employee_id=$1",
        [worker],
      );
      await db.query("update public.hmo_policy set effective_from='2026-09-01' where id=true");
      await db.exec("reset role");
      await db.exec("set role authenticated");
      created.attendance_records = await update("attendance_records", created.attendance_records, { classification: "late", late_minutes: 30, overtime_minutes: 60, night_minutes: 60, work_day_type: "rest_day" });
      created.payroll_items = await update("payroll_items", created.payroll_items, { attendance_adjustments: 0, benefits: 0, deductions: 0, other_deductions: 0 });
      const leave = await create("leave_requests", { employee_id: worker, leave_type: "vacation", start_date: "2026-09-02", end_date: "2026-09-02", total_days: 1, is_paid: true, reason: "Approved paid leave", status: "draft" });
      const submitted = await update("leave_requests", leave, { status: "submitted" });
      const approved = await update("leave_requests", submitted, { status: "approved" });
      assert.equal(approved.approved_by, admin);
      const annualLeave = await create("leave_requests", { employee_id: worker, leave_type: "annual", start_date: "2026-09-10", end_date: "2026-09-10", total_days: 1, is_paid: true, reason: "Annual leave", status: "draft", rejection_reason: null });
      const submittedAnnual = await update("leave_requests", annualLeave, { status: "submitted" });
      await update("leave_requests", submittedAnnual, { status: "approved" });
      const unpaidLeave = await create("leave_requests", { employee_id: worker, leave_type: "unpaid", start_date: "2026-09-11", end_date: "2026-09-11", total_days: 1, is_paid: false, reason: "Unpaid leave", status: "draft", rejection_reason: null });
      const submittedUnpaid = await update("leave_requests", unpaidLeave, { status: "submitted" });
      await update("leave_requests", submittedUnpaid, { status: "approved" });
      const newCategory = await create("leave_requests", { employee_id: outsider, leave_type: "bereavement", start_date: "2026-10-05", end_date: "2026-10-05", total_days: 1, is_paid: true, reason: "Bereavement", status: "draft", rejection_reason: null });
      const submittedNewCategory = await update("leave_requests", newCategory, { status: "submitted" });
      const rejectedNewCategory = await update("leave_requests", submittedNewCategory, { status: "rejected", rejection_reason: "Please resubmit with updated dates." });
      assert.equal(rejectedNewCategory.status, "rejected");
      assert.equal(rejectedNewCategory.rejection_reason, "Please resubmit with updated dates.");
      await create("attendance_records", { employee_id: worker, external_id: "MANUAL-PAID-LEAVE", attendance_date: "2026-09-02", classification: "absent", absence_minutes: 480 });

      const sss = await db.query<{ value: { msc: number; employee: number; employer: number } }>("select public.sss_monthly_contribution(32000) value");
      assert.deepEqual(sss.rows[0].value, { msc: 32000, employee: 1600, employer: 3230 });
      const philhealth = await db.query<{ value: { premium: number; employee: number; employer: number } }>("select public.philhealth_monthly_contribution(32000) value");
      assert.deepEqual(philhealth.rows[0].value, { premium: 1600, employee: 800, employer: 800 });
      assert.equal(Number((await db.query<{ value: number }>("select public.bir_withholding_tax(15000,'first_cutoff') value")).rows[0].value), 687.45);

      const calculation = await db.query<{ value: { employees: number; ruleVersion: string } }>("select public.calculate_payroll_run_complete($1) value", [created.payroll_runs.id]);
      assert.equal(calculation.rows[0].value.employees, 1);
      assert.equal(calculation.rows[0].value.ruleVersion, "PH-2025-BIR-2023-v2");
      const report = await db.query<{ value: { run: { schedule: string; preparation_date: string }; items: Array<Record<string, unknown>> } }>("select public.payroll_run_report($1) value", [created.payroll_runs.id]);
      const item = report.rows[0].value.items[0];
      assert.equal(report.rows[0].value.run.schedule, "first_cutoff");
      assert.equal(report.rows[0].value.run.preparation_date, "2026-09-19");
      assert.equal(item.paidLeaveDays, 2);
      assert.equal(item.lateMinutes, 30);
      assert.equal(item.lateDeduction, 90.91);
      assert.equal(item.absenceMinutes, 0);
      assert.equal(item.absenceDeduction, 0);
      assert.equal(item.overtimeMinutes, 60);
      assert.equal(item.overtimePay, 307.27);
      assert.equal(item.nightDifferential, 18.18);
      assert.equal(item.restDayOvertimeMinutes, 60);
      assert.equal(item.sssEmployee, 800);
      assert.equal(item.philhealthEmployee, 400);
      assert.equal(item.pagibigEmployee, 100);
      assert.ok(Number(item.withholdingTax) > 0);
      assert.ok(Number(item.taxableCompensation) > 0);
      assert.ok(Number(item.netPay) < Number(item.grossPay));
      assert.equal(item.benefitEmployer, 600);
      const calculationSnapshot = item.calculation as Record<string, unknown>;
      assert.equal(calculationSnapshot.hmoEmployerCost, 500);
      assert.equal(calculationSnapshot.hmoPricingBasis, "planning_estimate");
      await db.query("select public.calculate_payroll_run_complete($1)", [created.payroll_runs.id]);
      const afterRecalculation = await db.query<{ value: { items: Array<Record<string, unknown>> } }>("select public.payroll_run_report($1) value", [created.payroll_runs.id]);
      assert.equal(afterRecalculation.rows[0].value.items[0].benefitEmployer, 600);
      assert.equal((afterRecalculation.rows[0].value.items[0].calculation as Record<string, unknown>).hmoEmployerCost, 500);
      created.payroll_items = (await read("payroll_items", created.payroll_items.id)).rows[0];
    });
    await t.test("missing attendance assumes weekday absences but preserves approved paid leave", async () => {
      await as(admin);
      const novemberPaidLeave = await create("leave_requests", {
        employee_id: worker,
        leave_type: "vacation",
        start_date: "2026-11-02",
        end_date: "2026-11-02",
        total_days: 1,
        is_paid: true,
        reason: "Approved leave during no-attendance payroll test",
        status: "draft",
        rejection_reason: null,
      });
      const submittedNovemberLeave = await update("leave_requests", novemberPaidLeave, { status: "submitted" });
      await update("leave_requests", submittedNovemberLeave, { status: "approved" });
      const noAttendanceRun = await create("payroll_runs", {
        period_start: "2026-11-01",
        period_end: "2026-11-15",
        pay_date: "2026-11-15",
      });
      await db.query("select public.calculate_payroll_run_complete($1)", [noAttendanceRun.id]);
      const noAttendanceReport = await db.query<{
        value: { items: Array<{ employeeId: string; workedDays: number; paidLeaveDays: number; absenceMinutes: number; absenceDeduction: number; netPay: number; calculation: Record<string, unknown> }> };
      }>("select public.payroll_run_report($1) value", [noAttendanceRun.id]);
      const noAttendanceItem = noAttendanceReport.rows[0].value.items.find((entry) => entry.employeeId === worker);
      assert.ok(noAttendanceItem);
      assert.equal(noAttendanceItem.workedDays, 0);
      assert.equal(noAttendanceItem.paidLeaveDays, 1);
      assert.equal(noAttendanceItem.absenceMinutes, 9 * 480);
      assert.ok(noAttendanceItem.absenceDeduction > 0);
      assert.ok(noAttendanceItem.netPay >= 0);
      assert.equal(noAttendanceItem.calculation.missingAttendanceTreatedAsWeekdayAbsence, true);
      assert.equal(noAttendanceItem.calculation.assumedAbsenceDays, 9);
      await db.exec("reset role");
      await db.exec("set role service_role");
      await db.query("delete from public.payroll_items where payroll_run_id=$1", [noAttendanceRun.id]);
      await db.query("delete from public.payroll_runs where id=$1", [noAttendanceRun.id]);
      await db.exec("reset role");
      await as(admin);
    });
    await t.test("approved bonuses are idempotent and payroll follows approval states", async () => {
      const run=await create("payroll_runs",{period_start:"2026-10-01",period_end:"2026-10-15",pay_date:"2026-10-15"});
      const firstCalculation=await db.query<{value:{validation:{passed:boolean;issues:unknown[];comparisons:unknown[]}}}>("select public.calculate_payroll_run_complete($1) value",[run.id]);
      if(!firstCalculation.rows[0].value.validation.passed) throw new Error(JSON.stringify(firstCalculation.rows[0].value.validation));
      const secondCalculation=await db.query<{value:{validation:{passed:boolean;issues:unknown[];comparisons:unknown[]}}}>("select public.calculate_payroll_run_complete($1) value",[run.id]);
      if(!secondCalculation.rows[0].value.validation.passed) throw new Error(JSON.stringify(secondCalculation.rows[0].value.validation));
      const report=await db.query<{value:{items:Array<{bonus:number}>}}>("select public.payroll_run_report($1) value",[run.id]);
      assert.equal(report.rows[0].value.items[0].bonus,1000);
      const submitted=await db.query<{value:{status:string}}>("select public.transition_payroll_run($1,'pending_approval') value",[run.id]);
      assert.equal(submitted.rows[0].value.status,"pending_approval");
      await assert.rejects(db.query("select public.transition_payroll_run($1,'approved')",[run.id]),/Finance approval and disbursement are handled outside this system/i);
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub','',false)");
      await db.exec("set role service_role");
      await db.query("update public.payroll_runs set status='approved',approved_by=$2,approved_at=now() where id=$1",[run.id,admin]);
      await db.query("update public.payroll_runs set status='paid' where id=$1",[run.id]);
      await db.exec("reset role");
      await as(admin);
      await assert.rejects(db.query("select public.transition_payroll_run($1,'draft')",[run.id]),/Invalid payroll transition/);
      await as(admin);
      const snapshot = await db.query<{ value: { items: Array<{ employeeId: string; paidBasicSalary: number; amount: number; paidPayrollEntries: number }> } }>("select public.payroll_13th_month_snapshot(2026) value");
      const included = snapshot.rows[0].value.items.find((item) => item.employeeId === worker);
      const paidBasicSalary = Number((await db.query<{ basic_salary: number }>("select basic_salary from public.payroll_items where payroll_run_id=$1 and employee_id=$2", [run.id, worker])).rows[0].basic_salary);
      assert.equal(included?.paidBasicSalary, paidBasicSalary);
      assert.equal(included?.amount, Math.round(paidBasicSalary / 12 * 100) / 100);
      assert.equal(included?.paidPayrollEntries, 1);
      await as(worker);
      await assert.rejects(db.query("select public.payroll_13th_month_snapshot(2026)"), /cannot view 13th-month/i);
    });
    await t.test("employees cannot mutate records, read coworkers, self-approve, or inject SQL/fields", async () => {
      await as(worker);
      assert.equal((await read("profiles")).count, 1);
      assert.equal((await read("claims")).count, 2);
      assert.equal((await read("payroll_runs")).count, 2);
      await assert.rejects(create("departments", { name: "Escalation", code: "BAD" }), /role/);
      await assert.rejects(db.query("select public.admin_access_snapshot('')"),/super administrator/i);
      await assert.rejects(db.query("update public.claims set status = 'approved' where employee_id = $1", [worker]), /permission denied/);
      await as(outsider);
      assert.equal((await read("claims")).count, 0);
      assert.equal((await read("payroll_runs")).count, 0);
      await assert.rejects(db.query("select public.record_history('claims',$1)", [created.claims.id]), /authorized/);
      await as(admin);
      await assert.rejects(create("profiles; drop table profiles;--", {}), /Unknown/);
      await assert.rejects(update("payroll_runs", (await read("payroll_runs")).rows[0], { total_net: 1 }), /cannot be changed/);
      await assert.rejects(create("user_roles", { role: "super_admin" }), /Unknown/);
    });
    await t.test("finalized payroll is immutable, including through the item editor", async () => {
      await db.exec("reset role");
      await db.query("update public.payroll_runs set status = 'paid' where id = $1", [created.payroll_runs.id]);
      await as(admin);
      await assert.rejects(update("payroll_items", created.payroll_items, { basic_salary: 1 }), /draft/);
      await assert.rejects(remove("payroll_items", created.payroll_items), /draft/);
      await assert.rejects(remove("payroll_runs", (await read("payroll_runs")).rows[0]), /draft/);
      await db.exec("reset role");
      await db.query("update public.payroll_runs set status = 'draft' where id = $1", [created.payroll_runs.id]);
      await as(admin);
    });
    await t.test("deleting draft entries updates totals; other CRUD deletes leave audit history", async () => {
      for (const entity of ["payroll_items", "claims", "employee_benefits", "benefit_plans", "benefit_providers", "compensation_reviews", "compensation_cycles", "employee_compensation_history", "attendance_records", "departments"]) {
        await remove(entity, (await read(entity, created[entity].id)).rows[0]);
        assert.equal((await read(entity, created[entity].id)).count, 0, entity);
      }
      const run = (await read("payroll_runs", created.payroll_runs.id)).rows[0];
      assert.equal(run.total_net, 0); assert.equal(run.employee_count, 0);
      await remove("payroll_runs", run);
      const history = await db.query<{ value: { action: string }[] }>("select public.record_history('payroll_runs',$1) value", [run.id]);
      assert.equal(history.rows[0].value[0].action, "delete");
      assert.ok(history.rows[0].value.some((item) => item.action === "insert"));
    });
    await t.test("anonymous users cannot execute record mutations", async () => {
      await db.exec("reset role; set role anon");
      await assert.rejects(create("departments", { name: "Anon", code: "ANON" }), /permission denied/);
    });
  } finally { await db.close(); }
});
