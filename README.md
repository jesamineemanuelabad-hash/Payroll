# Payroll & Benefits Management System

A Next.js, TypeScript, and Supabase application with persistent CRUD for employees, attendance, compensation, benefits, claims, and draft payroll records.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` for the marketing site. Operational record pages, Overview, and HR Analytics require Supabase configuration and an authenticated account. Without configuration they show setup guidance rather than fabricated metrics.

## Connect Supabase

Follow [the setup guide](docs/supabase-setup.md) to apply all migrations, create the first administrator securely, configure Gmail SMTP in `.env.local`, and sign in at `/login`. The migrations protect the system owner, enforce active-account RBAC and 90-second email-code verification for privileged roles, enable live reporting and automatic on-visit AI attendance scoring, add the auditable payroll engine, HR2 ownership, staged HR/Finance workflows, and account/access management.

## Record workspaces

| Route | Records |
| --- | --- |
| `/payroll-benefits/attendance` | Employees, attendance, paid-leave approvals, departments |
| `/payroll-benefits/compensation` | Salary proposals, review cycles, salary history |
| `/payroll-benefits/benefits` | Employee benefits, plans, providers |
| `/payroll-benefits/claims` | Claims, document links, review decisions |
| `/payroll-benefits/payroll` | Payroll runs, contribution/tax results, 13th-month calculation, and policy |
| `/settings/profile` | Signed-in account profile and password |
| `/settings/access` | Super-admin user invitations, RBAC roles, account status, and department scope |
| `/mfa/setup` | Email verification information for sign-in |

Record pages support forms, validation, search, pagination, detail views, updates, confirmed deletion, CSV/Excel exports, and audit history. Employee creation is HR2-owned: the Employee Management page synchronizes profiles and operational inputs, then refreshes the displayed records. Compensation follows Pending → HR Review → Finance Review → Approved → Implemented with effective dates and budget checks. Claims retain requested and approved amounts and follow Pending → Under Review → Finance Approval → Approved/Rejected → Paid. Draft payroll can be calculated from effective salaries, attendance minutes, approved paid leave, benefits, claims, bonuses, and statutory rules. Payroll run details show saved employee entries and payslips; contribution and tax tabs display saved calculation results. The 13th-month tab calculates a clearly labeled estimate from basic salary in paid payroll entries for the selected year, divided by twelve. Payroll screens do not provide CSV/Excel import or export controls.

## Scope

CRUD, effective-dated payroll policy, cutoff payroll calculation, SSS/PhilHealth/Pag-IBIG/BIR deductions, premium overtime, night differential, validation gates, payroll approval/payment states, payslips, and live Overview/HR Analytics reporting are implemented. The 13th-month view does not project unpaid or future salary; it only summarizes paid payroll entries in the selected calendar year. Visiting Analytics automatically runs the configured XGBoost HTTP service when attendance inputs are stale and persists validated predictions. This is not an unattended scheduled job. Employee Management can invoke a configured HR2 synchronization service. File uploads, bank disbursement, loan deductions, and automatic public-holiday calendar synchronization remain separate integrations. Statutory policy versions must be reviewed when government rules change.

## Verification

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Database tests use an isolated PostgreSQL engine and simulated Auth identities. Complete the hosted-Supabase smoke checks in [the setup guide](docs/supabase-setup.md) after connecting your project.
