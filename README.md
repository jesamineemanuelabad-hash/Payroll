# Payroll & Benefits Management System

A Next.js, TypeScript, and Supabase application with persistent CRUD for employees, attendance, compensation, benefits, claims, and draft payroll records.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` for the marketing site. Operational record pages, Overview, and HR Analytics require Supabase configuration and an authenticated account. Without configuration they show setup guidance rather than fabricated metrics.

## Connect Supabase

Follow [the setup guide](docs/supabase-setup.md) to apply all migrations, create the first administrator securely, configure Gmail SMTP in `.env.local`, and sign in at `/login`. The migrations protect the system owner, enforce active-account RBAC and 90-second email-code verification for privileged roles, enable workforce-focused HR analytics, add the auditable payroll engine, HR2 ownership, staged HR/Finance workflows, and account/access management.

## Record workspaces

| Route | Records |
| --- | --- |
| `/payroll-benefits/attendance` | Employee records, attendance, leave management, departments |
| `/payroll-benefits/compensation` | Salary proposals, review cycles, salary history |
| `/payroll-benefits/benefits` | Employee benefits, plans, providers |
| `/payroll-benefits/claims` | Claims, document links, review decisions |
| `/payroll-benefits/payroll` | Payroll runs, contribution/tax results, 13th-month calculation, and policy |
| `/settings/profile` | Signed-in account profile and password |
| `/settings/access` | Super-admin user invitations, RBAC roles, account status, and department scope |
| `/mfa/setup` | Email verification information for sign-in |

Record pages support forms, validation, search, pagination, detail views, updates, confirmed deletion, and audit history. The interface does not provide import or export controls. Employee master records remain HR2-owned and view-only here; Super Admin can manage the other authorized operational workflows. Compensation follows Draft → Pending → HR Review → For Finance Review; Finance handles approval and implementation outside this system. Claims follow Pending → Under Review → For Finance Review, then can be included in payroll only after Finance approval is recorded. Payroll runs are calculated and validated here, then sent to Finance; this app does not approve or disburse money. Payroll run details show saved employee entries and payslips, while contribution and tax tabs display calculation results. The 13th-month tab calculates a clearly labeled estimate from basic salary in paid payroll entries for the selected year, divided by twelve.

Employee Management includes leave request review, employee balances, and a leave type catalog. HR Admins, HR Managers, and Super Admins can approve submitted requests or reject them with a required reason. The default company policy provides 10 calendar-year days in a shared vacation/annual/service-incentive bank and 10 sick days, with no carry-over. Balances deduct approved paid requests and refresh after an HR decision. Other approved leave is tracked by type and reviewed against its applicable event or statutory eligibility. Only approved requests marked paid are included in the next calculation of an overlapping draft payroll run. To seed submitted requests for approximately 40% of active payroll employees, run `npm run seed:leave-requests` for a dry run, then `npm run seed:leave-requests -- --apply` to insert them.

## Scope

CRUD, effective-dated payroll policy, cutoff payroll calculation, SSS/PhilHealth/Pag-IBIG/BIR deductions, premium overtime, night differential, validation gates, Finance handoff, payslips, and live Overview/HR Analytics reporting are implemented. The 13th-month view does not project unpaid or future salary; it only summarizes paid payroll entries in the selected calendar year. Visiting Analytics automatically runs the configured XGBoost HTTP service when attendance inputs are stale and persists validated predictions. This is not an unattended scheduled job. Employee Management can invoke a configured HR2 synchronization service. Finance review, bank disbursement, loan deductions, and automatic public-holiday calendar synchronization remain separate integrations. Statutory policy versions must be reviewed when government rules change.

## Verification

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Database tests use an isolated PostgreSQL engine and simulated Auth identities. Complete the hosted-Supabase smoke checks in [the setup guide](docs/supabase-setup.md) after connecting your project.
