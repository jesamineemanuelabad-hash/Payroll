# Payroll & Benefits — incremental architecture

> September 6 update: operational routes use `RecordPage` / `RecordWorkspace` and validated Supabase RPCs. Overview and HR Analytics read permission-checked live aggregates; HR Analytics can persist XGBoost predictions; and payroll has a database-side, versioned calculation and approval engine with paid leave, statutory deductions, approved compensation, detailed Excel, and print-ready payslips. See [Supabase setup](supabase-setup.md) for deployment and review requirements.

## 1. UX architecture

The product uses one calm, collapsible workspace shell. A cross-functional Overview provides the operational starting point, while **Payroll & Benefits** is the only expanded navigation group and exposes Payroll, Compensation, Claims, Benefits, and Analytics without duplicating global navigation. Desktop favors dense, scannable workflows; small screens retain hierarchy and move primary navigation into a drawer.

Payroll Management follows a predictable sequence:

1. orient with breadcrumb, title, and the next payroll date;
2. scan five compact operational metrics;
3. narrow runs by keyword, status, and date range;
4. open a payroll period for employee-level detail;
5. initiate high-context actions from the page header or row menu.

Loading, empty-filter, and error states use the same page geometry to avoid layout shift. Important workflows receive inline feedback; lightweight exports and recalculation actions use toasts.

## 2. Database architecture

The source of truth is PostgreSQL through Supabase. `profiles` belongs to `auth.users`; organizational scope is represented by departments plus explicit manager access. Payroll runs own immutable payroll items. Approval and status changes are recorded in `audit_logs`. Compensation, claims, and benefits use normalized domain tables and database enums.

Authorization is enforced in PostgreSQL with helper functions and row-level policies. Employees can read only their own sensitive records. Managers can read profiles and approved records inside departments granted through `manager_departments`. Payroll and HR roles receive narrowly scoped write access. Terminated profiles are denied immediately by the database and banned in Supabase Auth by the server-side access action. Super-admin access changes use audited database functions with owner and last-admin lockout protection; direct authenticated role-table writes are revoked. The service role is never exposed to the browser and is used only by server-side bootstrap, invitation, and account-status workflows.

The complete migration, indexes, constraints, trigger functions, and RLS policies are in `supabase/migrations/202608280001_initial_payroll_benefits.sql`.

HR2 integration and attendance intelligence are isolated behind server-only contracts. The HR2 synchronization webhook retrieves employees, attendance, effective compensation, and approved requests; PostgreSQL stores source cursors and idempotent adjustment records. Payroll & Benefits does not permit manual employee creation because HR2 owns the employee master data. XGBoost receives a versioned attendance feature payload and returns classifications plus anomaly scores. Predictions are review signals only and never mutate payroll without an approved `payroll_adjustments` record. The extension schema and RLS policies are in `supabase/migrations/202608300001_ess_attendance_analytics.sql`.

## 3. Folder structure

```text
app/
  (dashboard)/
    payroll-benefits/payroll/
      [id]/page.tsx
      page.tsx
      loading.tsx
      error.tsx
  globals.css
components/
  attendance/
  claims/
  compensation/
  benefits/
  analytics/
  payroll/
  shared/
  ui/
lib/
  analytics/
  data/
  integrations/
  supabase/
  validations/
supabase/
  migrations/
  seed.sql
types/
```

Pages load their initial data through authenticated Server Components and permission-checked RPCs. Client Components handle navigation, filters, chart animation, exports, dialogs, and form state. When Supabase is unavailable, operational pages show an explicit setup state; they do not substitute sample records.

## 4. Component architecture

- `DashboardShell`: responsive navigation and workspace chrome.
- `PageHeader`, `MetricCard`, `StatusBadge`: shared information primitives.
- `RecordWorkspace`: live CRUD, search, references, audit history, CSV, and Excel for operational entities.
- `PayrollRunActions`: calculation, submission, approval, return-to-draft, paid status, register export, and payslip printing.
- `AccessControl`: invitation, roles, manager scope, payroll eligibility, and Auth-backed account activation.
- `OverviewDashboard` / `HrAnalyticsDashboard`: live aggregate reporting and model-scoring controls.

HR2 persistence and XGBoost execution remain server-only integration boundaries. Bank disbursement, uploads, Pag-IBIG/loans, and holiday/rest-day calendars require separate reviewed integrations or rule migrations.
