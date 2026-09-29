-- Payroll & Benefits foundation for Supabase/PostgreSQL
create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin', 'hr_admin', 'payroll_manager', 'hr_manager', 'manager', 'employee');
create type public.payroll_status as enum ('draft', 'processing', 'pending_approval', 'approved', 'paid', 'failed');
create type public.payroll_item_status as enum ('ready', 'needs_review', 'excluded');
create type public.compensation_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type public.claim_category as enum ('transportation', 'meals', 'medical', 'travel', 'office_expense', 'communication', 'other');
create type public.claim_status as enum ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'paid');
create type public.benefit_status as enum ('pending', 'active', 'inactive', 'terminated', 'expired');
create type public.enrollment_type as enum ('new_enrollment', 'plan_change', 'add_dependent', 'terminate_coverage');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_name_not_blank check (btrim(name) <> ''),
  constraint departments_code_format check (code ~ '^[A-Z0-9_-]{2,16}$')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_number text not null unique,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  department_id uuid references public.departments(id) on delete set null,
  manager_id uuid references public.profiles(id) on delete set null,
  job_title text not null,
  location text,
  employment_type text not null default 'regular',
  employment_status text not null default 'active',
  hired_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_not_blank check (btrim(first_name) <> '' and btrim(last_name) <> ''),
  constraint profiles_employment_status check (employment_status in ('active', 'on_leave', 'terminated'))
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.manager_departments (
  manager_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (manager_id, department_id)
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status public.payroll_status not null default 'draft',
  employee_count integer not null default 0,
  total_gross numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  total_contributions numeric(14,2) not null default 0,
  total_net numeric(14,2) not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_runs_period_valid check (period_end >= period_start),
  constraint payroll_runs_pay_date_valid check (pay_date > period_end),
  constraint payroll_runs_totals_nonnegative check (total_gross >= 0 and total_deductions >= 0 and total_contributions >= 0 and total_net >= 0),
  constraint payroll_runs_period_unique unique (period_start, period_end)
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  basic_salary numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  overtime numeric(12,2) not null default 0,
  gross_pay numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,
  contributions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  status public.payroll_item_status not null default 'ready',
  calculation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_items_amounts_nonnegative check (basic_salary >= 0 and allowances >= 0 and overtime >= 0 and gross_pay >= 0 and deductions >= 0 and contributions >= 0 and net_pay >= 0),
  constraint payroll_items_employee_run_unique unique (payroll_run_id, employee_id)
);

create table public.compensation_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  budget numeric(14,2) not null check (budget >= 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint compensation_cycles_dates_valid check (ends_on >= starts_on)
);

create table public.compensation_reviews (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  cycle_id uuid not null references public.compensation_cycles(id) on delete cascade,
  current_salary numeric(12,2) not null check (current_salary >= 0),
  proposed_salary numeric(12,2) not null check (proposed_salary >= 0),
  increase_percentage numeric(6,3) not null default 0,
  bonus numeric(12,2) not null default 0 check (bonus >= 0),
  justification text,
  status public.compensation_status not null default 'draft',
  submitted_by uuid references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, cycle_id)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  claim_number text not null unique,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  category public.claim_category not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  receipt_url text,
  submitted_at timestamptz,
  status public.claim_status not null default 'draft',
  approver_id uuid references public.profiles(id) on delete restrict,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint claims_rejection_reason_required check (status <> 'rejected' or nullif(btrim(rejection_reason), '') is not null)
);

create table public.benefit_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  contact_information jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.benefit_plans (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.benefit_providers(id) on delete restrict,
  name text not null,
  description text,
  employee_cost numeric(12,2) not null default 0 check (employee_cost >= 0),
  employer_cost numeric(12,2) not null default 0 check (employer_cost >= 0),
  coverage_type text not null check (coverage_type in ('employee_only', 'employee_plus_one', 'family')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, name)
);

create table public.employee_benefits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.benefit_plans(id) on delete restrict,
  membership_number text not null unique,
  effective_date date not null,
  expiration_date date,
  status public.benefit_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_benefits_dates_valid check (expiration_date is null or expiration_date >= effective_date)
);

create table public.dependents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  relationship text not null,
  birth_date date not null,
  status public.benefit_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.benefit_enrollments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.benefit_plans(id) on delete restrict,
  enrollment_type public.enrollment_type not null,
  status public.benefit_status not null default 'pending',
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index profiles_department_idx on public.profiles(department_id);
create index profiles_manager_idx on public.profiles(manager_id);
create index payroll_runs_pay_date_status_idx on public.payroll_runs(pay_date desc, status);
create index payroll_items_employee_idx on public.payroll_items(employee_id, payroll_run_id);
create index compensation_reviews_employee_idx on public.compensation_reviews(employee_id, cycle_id);
create index claims_employee_status_idx on public.claims(employee_id, status, submitted_at desc);
create index employee_benefits_employee_status_idx on public.employee_benefits(employee_id, status);
create index dependents_employee_idx on public.dependents(employee_id);
create index benefit_enrollments_employee_idx on public.benefit_enrollments(employee_id, requested_at desc);
create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['departments','profiles','payroll_runs','payroll_items','compensation_cycles','compensation_reviews','claims','benefit_providers','benefit_plans','employee_benefits','dependents','benefit_enrollments']
  loop
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- Security-definer helpers avoid recursive RLS lookups. Revoke direct execution from anonymous clients.
create or replace function public.has_any_role(required_roles public.app_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = any(required_roles)
  );
$$;

create or replace function public.can_access_employee(target_employee_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    target_employee_id = auth.uid()
    or public.has_any_role(array['super_admin','hr_admin','payroll_manager','hr_manager']::public.app_role[])
    or exists (
      select 1
      from public.profiles employee
      join public.manager_departments scope on scope.department_id = employee.department_id
      where employee.id = target_employee_id and scope.manager_id = auth.uid()
    );
$$;

revoke all on function public.has_any_role(public.app_role[]) from public;
revoke all on function public.can_access_employee(uuid) from public;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;
grant execute on function public.can_access_employee(uuid) to authenticated;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.manager_departments enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.compensation_cycles enable row level security;
alter table public.compensation_reviews enable row level security;
alter table public.claims enable row level security;
alter table public.benefit_providers enable row level security;
alter table public.benefit_plans enable row level security;
alter table public.employee_benefits enable row level security;
alter table public.dependents enable row level security;
alter table public.benefit_enrollments enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated users read departments" on public.departments for select to authenticated using (true);
create policy "hr admins manage departments" on public.departments for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));

create policy "users read permitted profiles" on public.profiles for select to authenticated using (public.can_access_employee(id));
create policy "hr admins manage profiles" on public.profiles for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));

create policy "users read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_any_role(array['super_admin']::public.app_role[]));
create policy "super admins manage roles" on public.user_roles for all to authenticated using (public.has_any_role(array['super_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin']::public.app_role[]));
create policy "managers read own scope" on public.manager_departments for select to authenticated using (manager_id = auth.uid() or public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "hr admins manage manager scope" on public.manager_departments for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));

create policy "users read permitted payroll runs" on public.payroll_runs for select to authenticated using (
  public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[])
  or exists (select 1 from public.payroll_items item where item.payroll_run_id = id and public.can_access_employee(item.employee_id))
);
create policy "payroll roles create runs" on public.payroll_runs for insert to authenticated with check (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) and created_by = auth.uid());
create policy "payroll roles update runs" on public.payroll_runs for update to authenticated using (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]));

create policy "users read permitted payroll items" on public.payroll_items for select to authenticated using (public.can_access_employee(employee_id));
create policy "payroll roles manage items" on public.payroll_items for all to authenticated using (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]));

create policy "hr and managers read compensation cycles" on public.compensation_cycles for select to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager','manager']::public.app_role[]));
create policy "hr roles manage compensation cycles" on public.compensation_cycles for all to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]));
create policy "users read permitted compensation" on public.compensation_reviews for select to authenticated using (public.can_access_employee(employee_id));
create policy "hr and scoped managers manage compensation" on public.compensation_reviews for all to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) or (public.has_any_role(array['manager']::public.app_role[]) and public.can_access_employee(employee_id))) with check (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) or (public.has_any_role(array['manager']::public.app_role[]) and public.can_access_employee(employee_id)));

create policy "users read permitted claims" on public.claims for select to authenticated using (public.can_access_employee(employee_id));
create policy "employees create own claims" on public.claims for insert to authenticated with check (employee_id = auth.uid());
create policy "employees edit own draft claims" on public.claims for update to authenticated using (employee_id = auth.uid() and status in ('draft','submitted')) with check (employee_id = auth.uid());
create policy "hr roles review claims" on public.claims for update to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]));

create policy "authenticated users read active providers" on public.benefit_providers for select to authenticated using (status = 'active' or public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "authenticated users read active plans" on public.benefit_plans for select to authenticated using (status = 'active' or public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "hr admins manage providers" on public.benefit_providers for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "hr admins manage plans" on public.benefit_plans for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));

create policy "users read permitted employee benefits" on public.employee_benefits for select to authenticated using (public.can_access_employee(employee_id));
create policy "hr admins manage employee benefits" on public.employee_benefits for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "users read permitted dependents" on public.dependents for select to authenticated using (public.can_access_employee(employee_id));
create policy "employees manage own pending dependents" on public.dependents for insert to authenticated with check (employee_id = auth.uid() and status = 'pending');
create policy "hr admins manage dependents" on public.dependents for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "users read permitted enrollments" on public.benefit_enrollments for select to authenticated using (public.can_access_employee(employee_id));
create policy "employees request own enrollment" on public.benefit_enrollments for insert to authenticated with check (employee_id = auth.uid() and status = 'pending');
create policy "hr admins manage enrollments" on public.benefit_enrollments for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));

create policy "administrators read audit logs" on public.audit_logs for select to authenticated using (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]));
-- Audit writes should be performed by trusted database functions or the service role, never directly by clients.

comment on column public.payroll_items.calculation_snapshot is 'Versioned calculation inputs/results; statutory rules stay in payroll services, not UI code.';
comment on table public.audit_logs is 'Append-only audit history. No authenticated INSERT/UPDATE/DELETE policy is intentionally defined.';
