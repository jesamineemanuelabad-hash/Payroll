# Payroll & Benefits Management System

A Next.js, TypeScript, and Supabase application with persistent CRUD for employees, attendance, compensation, benefits, claims, and draft payroll records.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` for the marketing site. Operational record pages, Overview, and HR Analytics require Supabase configuration and an authenticated account. Without configuration they show setup guidance rather than fabricated metrics.

## Connect Supabase

Follow [the setup guide](docs/supabase-setup.md) to apply **all ten migrations**, create the first administrator securely, set `.env.local`, and sign in at `/login`. The latest migrations protect the system owner, enforce active-account RBAC and mandatory MFA for privileged roles, enable live reporting, add the auditable payroll engine and approval workflow, and provide account/access management.

## Record workspaces

| Route | Records |
| --- | --- |
| `/payroll-benefits/attendance` | Employees, attendance, paid-leave approvals, departments |
| `/payroll-benefits/compensation` | Salary proposals, review cycles, salary history |
| `/payroll-benefits/benefits` | Employee benefits, plans, providers |
| `/payroll-benefits/claims` | Claims, document links, review decisions |
| `/payroll-benefits/payroll` | Draft runs and employee payroll entries |
| `/settings/profile` | Signed-in account profile and password |
| `/settings/access` | Super-admin user invitations, RBAC roles, account status, and department scope |
| `/mfa/setup` | TOTP authenticator enrollment, backup factors, and factor removal |

Record pages support forms, validation, search, pagination, detail views, updates, confirmed deletion, CSV/Excel exports, and audit history. Draft payroll can be calculated from effective salaries, attendance minutes, approved paid leave, benefits, claims, bonuses, and statutory rules. The payroll detail route exports a detailed Excel register and a print/PDF-ready register plus one payslip per employee.

## Scope

CRUD, cutoff payroll calculation, payroll approval/payment states, automatic approved compensation application, payslips, and live Overview/HR Analytics reporting are implemented. The Analytics page can run the configured XGBoost HTTP service and persist validated predictions. The Attendance page can invoke a configured ESS synchronization service. File uploads, bank disbursement, Pag-IBIG/loan rules, and holiday/rest-day premium calendars remain separate integrations. Statutory tables are versioned in the calculation snapshot and must be reviewed when government rules change.

## Verification

```powershell
npm run test
npm run typecheck
npm run lint
npm run build
```

Database tests use an isolated PostgreSQL engine and simulated Auth identities. Complete the hosted-Supabase smoke checks in [the setup guide](docs/supabase-setup.md) after connecting your project.
