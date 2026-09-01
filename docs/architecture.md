# Payroll & Benefits — incremental architecture

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

Authorization is enforced in PostgreSQL with helper functions and row-level policies. Employees can read only their own sensitive records. Managers can read profiles and approved records inside departments granted through `manager_departments`. Payroll and HR roles receive narrowly scoped write access; the service role is never exposed to the browser.

The complete migration, indexes, constraints, trigger functions, and RLS policies are in `supabase/migrations/202608280001_initial_payroll_benefits.sql`.

ESS integration and attendance intelligence are isolated behind server-only contracts. The ESS synchronization webhook retrieves employees, attendance, effective compensation, and approved requests; PostgreSQL stores source cursors and idempotent adjustment records. XGBoost receives a versioned attendance feature payload and returns classifications plus anomaly scores. Predictions are review signals only and never mutate payroll without an approved `payroll_adjustments` record. The extension schema and RLS policies are in `supabase/migrations/202608300001_ess_attendance_analytics.sql`.

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

Pages remain Server Components and call query modules. Client Components are limited to navigation state, table interactions, dialogs, and form state. When Supabase environment variables are absent, the query module returns typed sample data so UI development stays deterministic.

## 4. Component architecture

- `DashboardShell`: responsive navigation and workspace chrome.
- `PageHeader`, `MetricCard`, `StatusBadge`: shared information primitives.
- `PayrollManagement`: search, filters, sorting, pagination, export, and create-run dialog.
- `PayrollTable`: TanStack Table configuration with accessible column controls and menus.
- `CreatePayrollRunDialog`: React Hook Form with centralized Zod validation.
- `getPayrollDashboard`: server-only data boundary mapping database rows into view models.

The next increments can add Compensation, Claims, Benefits, and Analytics behind the established navigation and shared primitives without growing the payroll page into a monolith.
