import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { recordSchema } from "../lib/records/validation";

const admin = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-000000000002";
const worker = "00000000-0000-4000-8000-000000000003";
const outsider = "00000000-0000-4000-8000-000000000004";
type Row = { id: string; updated_at: string; [key: string]: unknown };

test("server validation rejects invalid values and client-supplied protected fields", () => {
  assert.equal(recordSchema("payroll_runs", true).safeParse({ period_start: "2026-09-01", period_end: "2026-09-15", pay_date: "2026-09-15" }).success, true);
  assert.equal(recordSchema("payroll_runs", true).safeParse({ period_start: "2026-09-01", period_end: "2026-09-15", pay_date: "2026-09-20", total_net: 100 }).success, false);
  assert.equal(recordSchema("departments", true).safeParse({ name: "Finance", code: "fin" }).success, false);
  assert.equal(recordSchema("departments", true).safeParse({ name: "Finance", code: "FIN" }).success, true);
});

test("PostgreSQL CRUD, audit, authorization, and payroll consistency", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',nullif(current_setting('request.jwt.claim.sub',true),''),'aal',coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1')) $$;
      grant usage on schema public,auth to authenticated,anon,service_role;
      grant execute on function auth.uid() to authenticated,anon;
      alter default privileges in schema public grant all on tables to authenticated,anon;
      alter default privileges in schema public grant usage,select on sequences to authenticated;
    `);
    for (const file of ["202608280001_initial_payroll_benefits.sql", "202608300001_ess_attendance_analytics.sql", "202609050001_record_crud.sql", "202609060001_admin_bootstrap.sql", "202609060002_live_reporting.sql", "202609060003_payroll_engine.sql", "202609060004_account_settings.sql", "202609060005_rbac_management.sql", "202609060006_operational_workflows.sql", "202609060007_multi_factor_authentication.sql", "202609150001_automatic_attendance_scoring.sql", "202609190001_configurable_payroll_policy.sql", "202609220001_hr2_finance_workflows.sql", "202609230001_analytics_accuracy.sql"]) {
      // PGlite includes gen_random_uuid in core, but not the optional pgcrypto extension.
      const sql = (await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8")).replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    for (const id of [admin, reviewer, worker, outsider]) {
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
    async function as(user: string) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
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
    await as(admin);
    const created: Record<string, Row> = {};
    await t.test("privileged database operations require an aal2 session", async () => {
      await db.query("select set_config('request.jwt.claim.aal','aal1',false)");
      assert.equal((await db.query<{value:boolean}>("select public.current_user_requires_mfa() value")).rows[0].value,true);
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,false);
      await assert.rejects(db.query("select public.admin_access_snapshot('')"),/super administrator/i);
      await db.query("select set_config('request.jwt.claim.aal','aal2',false)");
      assert.equal((await db.query<{value:boolean}>("select public.has_mfa() value")).rows[0].value,true);
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
      await assert.rejects(update("compensation_reviews",financeReview,{status:"approved"}),/Finance review permission/i);
      await as(admin);
      const approved=await update("compensation_reviews",financeReview,{status:"approved"});
      assert.equal(approved.applied_at,null);
      const implemented=await update("compensation_reviews",approved,{status:"implemented"});
      assert.ok(implemented.applied_at);
      const salary=await db.query<{base_salary:string;effective_from:Date;source:string}>("select base_salary,effective_from,source from public.employee_compensation_history where source_review_id=$1",[proposal.id]);
      assert.equal(Number(salary.rows[0].base_salary),35000);
      assert.equal(salary.rows[0].effective_from.toISOString().slice(0,10),"2026-10-01");
      assert.equal(salary.rows[0].source,"compensation_review");
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
    await t.test("claims CRUD validates review and preserves approved records", async () => {
      created.claims = await create("claims", { employee_id: worker, claim_number: "CLM-1", category: "medical", expense_date:"2026-09-02", description: "Receipt", requested_amount: 500, approved_amount: 0, status: "draft" });
      created.claims = await update("claims", created.claims, { requested_amount: 600 });
      const decision = await create("claims", { employee_id: worker, claim_number: "CLM-APPROVAL", category: "transportation", expense_date:"2026-09-03", description: "Company travel", requested_amount: 2500, approved_amount: 2000, status: "draft" });
      await assert.rejects(update("claims", decision, { status: "approved" }), /Invalid claim transition/);
      const pending = await update("claims", decision, { status: "pending" });
      const reviewed = await update("claims", pending, { status: "under_review" });
      const finance = await update("claims", reviewed, { receipt_url: "https://example.com/receipt.pdf", verification_status: "verified", status: "finance_approval" });
      const approved = await update("claims", finance, { status: "approved" });
      assert.equal(approved.approver_id, admin); assert.equal(approved.amount,2000); assert.equal(approved.requested_amount,2500);
      await assert.rejects(remove("claims", approved), /Only drafts|read-only/);
      const paid=await update("claims",approved,{status:"paid"});
      assert.ok(paid.paid_at);
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
      const snapshot = await db.query<{ value: { summary: { employeeCount: number; currentGross: number }; model: null | { recordsScored: number }; anomalies: unknown[] } }>("select public.dashboard_snapshot(12,null,null,null) value");
      assert.equal(snapshot.rows[0].value.summary.employeeCount, 3);
      assert.equal(snapshot.rows[0].value.summary.currentGross, 1200);
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
      created.attendance_records = await update("attendance_records", created.attendance_records, { classification: "late", late_minutes: 30, overtime_minutes: 60, night_minutes: 60, work_day_type: "rest_day" });
      created.payroll_items = await update("payroll_items", created.payroll_items, { attendance_adjustments: 0, benefits: 0, deductions: 0, other_deductions: 0 });
      const leave = await create("leave_requests", { employee_id: worker, leave_type: "vacation", start_date: "2026-09-02", end_date: "2026-09-02", total_days: 1, is_paid: true, reason: "Approved paid leave", status: "draft" });
      const submitted = await update("leave_requests", leave, { status: "submitted" });
      const approved = await update("leave_requests", submitted, { status: "approved" });
      assert.equal(approved.approved_by, admin);
      await create("attendance_records", { employee_id: worker, external_id: "MANUAL-PAID-LEAVE", attendance_date: "2026-09-02", classification: "absent", absence_minutes: 480 });

      const sss = await db.query<{ value: { msc: number; employee: number; employer: number } }>("select public.sss_monthly_contribution(32000) value");
      assert.deepEqual(sss.rows[0].value, { msc: 32000, employee: 1600, employer: 3230 });
      const philhealth = await db.query<{ value: { premium: number; employee: number; employer: number } }>("select public.philhealth_monthly_contribution(32000) value");
      assert.deepEqual(philhealth.rows[0].value, { premium: 1600, employee: 800, employer: 800 });
      assert.equal(Number((await db.query<{ value: number }>("select public.bir_withholding_tax(15000,'first_cutoff') value")).rows[0].value), 687.45);

      const calculation = await db.query<{ value: { employees: number; ruleVersion: string } }>("select public.calculate_payroll_run_complete($1) value", [created.payroll_runs.id]);
      assert.equal(calculation.rows[0].value.employees, 1);
      assert.equal(calculation.rows[0].value.ruleVersion, "PH-2025-BIR-2023-v2");
      const report = await db.query<{ value: { run: { schedule: string; preparation_date: string }; items: Array<Record<string, number>> } }>("select public.payroll_run_report($1) value", [created.payroll_runs.id]);
      const item = report.rows[0].value.items[0];
      assert.equal(report.rows[0].value.run.schedule, "first_cutoff");
      assert.equal(report.rows[0].value.run.preparation_date, "2026-09-19");
      assert.equal(item.paidLeaveDays, 1);
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
      assert.ok(item.withholdingTax > 0);
      assert.ok(item.netPay < item.grossPay);
      created.payroll_items = (await read("payroll_items", created.payroll_items.id)).rows[0];
    });
    await t.test("approved bonuses are idempotent and payroll follows approval states", async () => {
      const run=await create("payroll_runs",{period_start:"2026-10-01",period_end:"2026-10-15",pay_date:"2026-10-15"});
      await db.query("select public.calculate_payroll_run_complete($1)",[run.id]);
      await db.query("select public.calculate_payroll_run_complete($1)",[run.id]);
      const report=await db.query<{value:{items:Array<{bonus:number}>}}>("select public.payroll_run_report($1) value",[run.id]);
      assert.equal(report.rows[0].value.items[0].bonus,1000);
      const submitted=await db.query<{value:{status:string}}>("select public.transition_payroll_run($1,'pending_approval') value",[run.id]);
      assert.equal(submitted.rows[0].value.status,"pending_approval");
      const approved=await db.query<{value:{status:string}}>("select public.transition_payroll_run($1,'approved') value",[run.id]);
      assert.equal(approved.rows[0].value.status,"approved");
      const paid=await db.query<{value:{status:string}}>("select public.transition_payroll_run($1,'paid') value",[run.id]);
      assert.equal(paid.rows[0].value.status,"paid");
      await assert.rejects(db.query("select public.transition_payroll_run($1,'draft')",[run.id]),/Invalid payroll transition/);
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
