# Payroll & Benefits Management System

A production-oriented Payroll Management increment built with Next.js App Router, strict TypeScript, Tailwind CSS, shadcn-style Radix primitives, TanStack Table, React Hook Form, Zod, and Supabase.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Without environment variables, the application intentionally uses typed Philippine payroll sample data and labels it as demo data.

## Connect Supabase

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Keep the service-role key server-only and use it only for trusted administrative jobs.
3. Apply `supabase/migrations/202608280001_initial_payroll_benefits.sql` with the Supabase CLI or SQL editor.
4. Apply `supabase/seed.sql` for department and benefits catalog data.
5. Create profiles and role assignments through a trusted onboarding function or service-role process; direct client inserts are intentionally blocked by RLS.

The public SaaS marketing site opens at `/`. The authenticated-style product workspace opens at `/overview`. Operational routes include:

- `/payroll-benefits/attendance` — ESS employee, salary, and time-record synchronization
- `/payroll-benefits/payroll` — payroll processing and calculation review
- `/payroll-benefits/compensation` — salary adjustments, history, and payroll application
- `/payroll-benefits/benefits` — benefit eligibility, administration, and payroll application
- `/payroll-benefits/claims` — ESS claims, document verification, and reimbursement processing
- `/payroll-benefits/analytics` — payroll analytics and XGBoost attendance intelligence

All record workspaces support CSV download and genuine `.xlsx` export. Analytics charts replay their motion on page load, browser refresh, manual refresh, and filter changes while respecting reduced-motion preferences.

The Overview is an interactive SaaS-style command center with live range and department filters, animated KPI sparklines, hoverable cost trends, drill-through pipeline stages, completable action items, segmented activity, and a global `Ctrl/⌘ + K` command palette.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
```

See `docs/architecture.md` for the UX, database, folder, and component architecture guiding the next module increments.
