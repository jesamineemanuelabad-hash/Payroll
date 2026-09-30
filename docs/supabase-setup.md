# Supabase setup and CRUD verification

## 1. Create a development database

Copy `.env.example` to `.env.local`, then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project. Set the server-only `SUPABASE_SERVICE_ROLE_KEY` for email-verification session recording and Access Control invitations. Configure the Gmail SMTP variables described below. Set `ADMIN_SETUP_TOKEN` only if you want to use the one-time `/setup` form. Never put server secrets in a `NEXT_PUBLIC_` variable.

Apply these files in order in the Supabase SQL editor (or your migration pipeline):

1. `scripts/supabase/migrations/202608280001_initial_payroll_benefits.sql`
2. `scripts/supabase/migrations/202608300001_ess_attendance_analytics.sql`
3. `scripts/supabase/migrations/202609050001_record_crud.sql`
4. `scripts/supabase/migrations/202609060001_admin_bootstrap.sql`
5. `scripts/supabase/migrations/202609060002_live_reporting.sql`
6. `scripts/supabase/migrations/202609060003_payroll_engine.sql`
7. `scripts/supabase/migrations/202609060004_account_settings.sql`
8. `scripts/supabase/migrations/202609060005_rbac_management.sql`
9. `scripts/supabase/migrations/202609060006_operational_workflows.sql`
10. `scripts/supabase/migrations/202609060007_multi_factor_authentication.sql`
11. `scripts/supabase/migrations/202609150001_automatic_attendance_scoring.sql`
12. `scripts/supabase/migrations/202609190001_configurable_payroll_policy.sql`
13. `scripts/supabase/migrations/202609220001_hr2_finance_workflows.sql`
14. `scripts/supabase/migrations/202609230001_analytics_accuracy.sql`
15. `scripts/supabase/migrations/202609290001_email_otp_mfa.sql`
16. `scripts/supabase/migrations/202609290002_custom_email_otp.sql`
17. `scripts/supabase/migrations/202609290003_remove_email_otp_hourly_limit.sql`
18. `scripts/supabase/migrations/202609290004_today_attendance_snapshot.sql`
19. `scripts/supabase/migrations/202609290005_today_active_employee_roster.sql`
20. `scripts/supabase/migrations/202609290006_include_demo_employees_in_today_roster.sql`
21. `scripts/supabase/migrations/202609290007_allow_nonpayroll_demo_attendance.sql`
22. `scripts/supabase/migrations/202609290008_use_existing_payroll_employee_roster.sql`
23. `scripts/supabase/migrations/202609290009_attendance_department_filters.sql`
24. `scripts/supabase/migrations/202609290010_exclude_system_admins_from_attendance.sql`
25. `scripts/supabase/migrations/202609290011_attendance_history_views.sql`
26. `scripts/supabase/migrations/202609300012_department_cards_snapshot.sql`
27. `scripts/supabase/migrations/202609300013_department_cards_simplify.sql`
28. `scripts/supabase/seed.sql` (optional department/provider/plan catalog)

Apply only migrations that have not already run. Do not rerun existing migrations. Back up any existing live data before changing its schema. The CRUD migration restricts authenticated direct table writes; application writes use validated RPCs. The operational workflow migration immediately denies terminated profiles at the database layer and adds payroll state transitions plus automatic compensation application.

Today’s Attendance lists every active payroll employee and joins that employee’s attendance row for the Manila calendar date. Employees without a row appear as **No record**, not as absent. Migration `202609290008_use_existing_payroll_employee_roster.sql` restores the roster to existing payroll-eligible employees and restores the normal database guard requiring attendance to reference payroll employees. Apply this migration after 290007, especially if the earlier demo-only migrations were already applied.

Migration `202609290009_attendance_department_filters.sql` adds department labels to the snapshot for the department filter in the Attendance summary. Migration `202609290010_exclude_system_admins_from_attendance.sql` also excludes the protected system owner and system-administrator profiles from the employee roster.

Migration `202609290011_attendance_history_views.sql` enables the historical attendance calendar, selected-date records, and paginated employee attendance history. These views use stored daily attendance rows, not raw biometric-device punch logs.

Migration `202609300012_department_cards_snapshot.sql` enables the department card view. Migration `202609300013_department_cards_simplify.sql` omits department-lead and payroll summaries; cards show department identity and active employee membership only.

To populate missing demo attendance for today in the Supabase project configured by `.env.local`, apply migrations 290008–290011, temporarily set `ALLOW_ATTENDANCE_SAMPLE_SEED=true`, and run `npm run seed:attendance-sample`. Confirm the displayed project hostname and prompt. The command uses existing active payroll employees except system owners and super administrators, creates no profiles or Auth users, and inserts varied sample attendance only for employees without a record today; existing attendance is never overwritten. Sample rows can affect payroll if included in a payroll run, so use this only for capstone/demo data. Remove the temporary allow flag afterward. Sample rows have `external_id` values prefixed `SAMPLE-ATT-` so they can be identified or removed.

## 2. Provision the initial administrator

Generate a private setup token locally, then place the result in `.env.local` as `ADMIN_SETUP_TOKEN`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the **service_role** key from Supabase project API settings into the server-only `SUPABASE_SERVICE_ROLE_KEY` variable, restart the development server, open `/login`, and select **Create first administrator**. Enter the token, administrator name, employee number, email, and a password of at least 12 characters.

The setup action uses the service key only on the server, creates a confirmed Supabase Authentication user, and calls a locked database function to create the profile and `super_admin` role. It works only while no `super_admin` exists. If profile creation fails, the newly created Auth user is removed. Remove `ADMIN_SETUP_TOKEN` after bootstrap. Keep `SUPABASE_SERVICE_ROLE_KEY` only if the Access Control screen must send Supabase Auth invitations; it remains server-only and must never use a `NEXT_PUBLIC_` prefix.

### Configure Gmail email-code delivery

Privileged sign-ins require the password followed by a one-time code sent by the application to the account's confirmed email. The code expires after 90 seconds and can be resent after 60 seconds. Supabase's Auth email OTP template and expiry setting are not used for this second step.

1. In the Google account, enable 2-Step Verification and create an App Password for this application. If Google does not offer App Passwords for the account, use an SMTP provider and its credentials instead.
2. In `.env.local`, set `EMAIL_SMTP_HOST=smtp.gmail.com`, `EMAIL_SMTP_PORT=587`, and `EMAIL_SMTP_USER` to the full Gmail address.
3. Set `EMAIL_SMTP_APP_PASSWORD` to the generated App Password (not the regular Google password), and set `EMAIL_FROM_ADDRESS` to that same Gmail address.
4. Generate a separate hash secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and set it as `EMAIL_OTP_HASH_SECRET`. Keep all these values private in `.env.local` and your deployment's secret manager. Never paste them into chat, commit them, or expose them in a `NEXT_PUBLIC_` variable.
5. Restart the app after setting the variables and test a privileged login using an account whose email is confirmed.

The application stores only an HMAC hash of each code. Codes are single-use and bound to the authenticated Supabase session; after verification, the database records proof for that session for up to 12 hours and requires that proof for privileged operations. An AAL2 authenticator session alone does not bypass the email check. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; it is needed for challenge issuance, verification, session proof, and Access Control invitations.

Alternatively, create and confirm an email/password user in Supabase Authentication, copy its UUID, and run the following in the trusted SQL editor:

```sql
begin;
insert into public.profiles (
  id, employee_number, first_name, last_name, email, job_title,
  is_payroll_employee, is_system_owner
) values (
  'REPLACE-WITH-AUTH-USER-UUID'::uuid,
  'ADMIN-001', 'Your first name', 'Your last name',
  'your-email@example.com', 'System administrator', false, true
);
insert into public.user_roles(user_id, role)
values ('REPLACE-WITH-AUTH-USER-UUID'::uuid, 'super_admin');
commit;
```

Both bootstrap methods are trusted administrative operations. The `/setup` form requires the private server token and closes after the first admin. Subsequent payroll employee profiles come from **Employee Management → Sync with HR2**; manual profile creation is disabled. If an employee also needs application access, invite or link their Authentication account through the controlled access workflow used by the HR2 integration. Deleting a profile does not delete its Authentication account. Deactivate employment or use the Auth dashboard when login access must also be revoked.

After applying the RBAC migration, a super administrator can manage users from **Account settings → Access control**. The trusted SQL editor remains an emergency administrative option:

```sql
insert into public.user_roles(user_id, role)
values ('REPLACE-WITH-EMPLOYEE-UUID'::uuid, 'employee')
on conflict do nothing;
```

| Role                  | CRUD permissions                                                   |
| --------------------- | ------------------------------------------------------------------ |
| `super_admin`         | All record modules                                                 |
| `hr_admin`            | Employees, departments, attendance, compensation, benefits, claims |
| `hr_manager`          | Compensation and claims                                            |
| `payroll_manager`     | Attendance, draft payroll runs and entries                         |
| `manager`, `employee` | Read permitted records through RLS; no CRUD mutation RPC access    |

An account without a profile/role may sign in but cannot create records. RLS limits its reads. Access Control supports invitations, atomic multi-role assignments, manager department scopes, employment status, and payroll eligibility. Direct authenticated writes to role and manager-scope tables are revoked; every application change is protected against owner/last-admin lockout and written to `audit_logs`. Invitations require the server-only service-role key and correctly configured Supabase Auth email delivery.

## 3. Sign in and create related records

Restart `npm run dev` after changing environment variables. Open `/login` and sign in.

Suggested operational order:

1. Departments → **Sync with HR2** → review synchronized Employees and Attendance. Manual employee creation is disabled because HR2 owns the employee master data.
2. Compensation cycles → Salary proposals; maintain effective salary history separately.
3. Benefit providers → Plans → Employee benefits.
4. Claims → Pending → Under Review → Finance Approval → Approved/Rejected → Paid.
5. Leave approvals → submit requests → approve paid leave.
6. Payroll policy → review the default and create a company-approved effective-dated version.
7. Payroll runs → create a 1st-cutoff, 2nd-cutoff, or monthly period → Open entries → Calculate payroll → validate → review → export Excel or print payslips.

Each applicable record module supports create, detail view, edit, confirmed delete, search, server pagination, CSV/Excel export across matching pages, and audit history for its permitted editor roles. Employees are the exception: profiles are synchronized from HR2 and cannot be created manually in Payroll & Benefits. Foreign-key selectors support searching beyond the first page. Mutation functions enforce version checks, field allowlists, role authorization, and transactions.

New claims and compensation proposals must start as drafts and be submitted before an approval decision. Self-approval is blocked. Compensation approval requires a reviewer other than the submitter. Approved claims/proposals, payroll-linked benefits, and non-draft payroll are protected from edits/deletes. Only draft claims/proposals may be deleted. References can prevent deletion; a compensation cycle with reviews and a payroll run with entries cannot be deleted until the permitted child records are removed. Audit history survives deletion; use the trusted SQL editor to inspect deleted-record events.

The editor timestamps use the browser's local time zone; database timestamps store an absolute instant. Salary history rejects overlapping effective date ranges, including shared endpoints. Close an old salary period the day before a new one starts.

## 4. Payroll calculation and approval process

Payroll is normally prepared two days before payday; the run stores that preparation date automatically. A valid period is 1st–15th, 16th–calendar-month-end, or the full calendar month. Payday may be the period end itself, supporting payment on the 15th and at month end.

When **Calculate payroll** runs, the database locks the draft and includes active payroll employees with an effective compensation record. Monthly and semi-monthly employees receive the applicable period share. Daily employees receive the daily rate for recorded worked days plus approved paid weekdays; hourly employees receive recorded worked hours plus paid-leave hours. Approved paid leave prevents absence deduction for fixed-salary employees. Saturdays and Sundays are excluded from automatically counted paid-leave days.

Late and undertime deductions are `hourly rate × minutes ÷ 60`. Absence deductions for fixed-salary employees use the policy workday length. Overtime uses the reviewed attendance work-day type and its effective policy multiplier: ordinary, rest day, special non-working day, regular holiday, or double holiday. Night minutes add the configured differential. Automatic public-holiday calendar synchronization remains an external integration. Undertime never offsets overtime.

The seeded policy uses the January 2025 SSS rates (employee 5%, employer 10%, ₱5,000–₱35,000 MSC plus employer EC), PhilHealth 5% with a ₱10,000 floor and ₱100,000 ceiling, and Pag-IBIG employee/employer rates with a ₱10,000 compensation cap. BIR withholding uses Annex E effective January 1, 2023. Contribution allocation can be split evenly or assigned to either cutoff. Taxable periodic compensation includes basic pay, allowances, overtime, night differential, and bonus, less employee mandatory contributions; approved expense reimbursements are excluded.

Each employee entry itemizes late, undertime, absence, categorized overtime, night differential, SSS, PhilHealth, Pag-IBIG, BIR withholding, benefit costs, and other authorized deductions. Gross pay, total deductions, employer contributions, and net pay are recomputed transactionally. Approved claims not already linked to payroll are included as reimbursements and linked to the run. The saved calculation snapshot records the exact effective policy. A recalculation preserves reviewed bonuses and other authorized deductions.

Calculation automatically runs pre-approval validation. Optional comparison cases check results against anonymized historical payslip totals using the policy tolerance. Payroll cannot be submitted until blocking issues and failed comparisons are resolved. Approved payroll stores a lock timestamp and non-draft entries are immutable. The print route generates an A4 register followed by one payslip per employee; the browser can print or save PDF. Excel contains the detailed employee register.

This release does not disburse payments, upload documents, or automatically update rules after a government announcement. Claim document review uses a saved HTTPS URL. Before production, a Philippine payroll professional should confirm the configured rule version, contribution-cutoff policy, taxable benefits, work schedule, and company rounding policy.

Overview and HR Analytics use the authenticated `dashboard_snapshot` RPC and export the currently filtered live snapshot. The protected system-owner identity is excluded from workforce counts and every employee-linked operation. Missing configuration or failed queries are shown as errors; the dashboards never fall back to demo metrics.

To enable automatic AI analysis, configure `XGBOOST_SERVICE_URL` and `XGBOOST_SERVICE_TOKEN` in the server environment. The service must implement `POST /v1/attendance/predict` using the contract in `lib/analytics/xgboost-contract.ts`. Opening HR Analytics checks the last 30 days of attendance, claims a database lease if inputs changed (or the last scoring is more than a day old), then persists a versioned model run and predictions. Concurrent visitors do not duplicate scoring; failures retry after 15 minutes. This is on-visit automatic scoring, not an unattended background schedule. A configured scoring service and a signed-in super/HR administrator with MFA are still required. Model results are review signals and never directly change payroll.

## 5. Verification

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Browser smoke tests: `npm run test:ui` starts an unconfigured development server on port 3100. On Windows it uses installed Microsoft Edge; on other systems install Chromium with `npx playwright install chromium`. Stop other Next dev sessions for this repository first, or point tests at an already-running **unconfigured** preview server:

```powershell
$env:PAYROLL_TEST_URL = 'http://localhost:3000'
npm run test:ui
```

These browser tests check responsive record pages, setup-state controls, login error handling, and that unconfigured dashboards do not render fabricated data. They are not a replacement for authenticated hosted-Supabase CRUD checks.

Database tests apply all migrations to an isolated PostgreSQL engine (PGlite), with Auth identities and role grants emulated for testing. The only omitted extension statement is `create extension pgcrypto`; the engine already supplies `gen_random_uuid`. Tests exercise first-admin bootstrap, system-owner protection, CRUD, constraints, RLS, audit events, edit conflicts, payroll aggregation, live reporting, and model-result persistence. They do not connect to or alter your Supabase project.

After setup, verify against hosted Supabase: sign in as administrator, create/update a record, reload, export it, inspect history, and delete a permitted draft. Repeat as an employee and confirm edit controls and unauthorized reads/writes are unavailable. Also test a second session editing the same record, and expired-session behavior. Hosted Auth/session cookies, Supabase API grants, and document access require this final environment check.
