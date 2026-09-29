-- ESS synchronization, payroll adjustment sources, and XGBoost attendance analytics.
create type public.integration_sync_status as enum ('queued', 'running', 'completed', 'completed_with_exceptions', 'failed');
create type public.attendance_classification as enum ('on_time', 'late', 'absent', 'overtime', 'on_leave');
create type public.adjustment_source as enum ('attendance', 'benefit', 'reimbursement', 'compensation', 'manual');

create table public.ess_integrations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  secret_reference text not null,
  enabled boolean not null default true,
  last_successful_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ess_integrations_https check (base_url ~ '^https://'),
  constraint ess_integrations_secret_reference check (btrim(secret_reference) <> '')
);

comment on column public.ess_integrations.secret_reference is 'Reference to a secret-vault entry. API tokens must never be stored in this table.';

create table public.integration_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.ess_integrations(id) on delete restrict,
  status public.integration_sync_status not null default 'queued',
  scopes text[] not null default array[]::text[],
  cursor_started text,
  cursor_completed text,
  records_received integer not null default 0 check (records_received >= 0),
  records_applied integer not null default 0 check (records_applied >= 0),
  exception_count integer not null default 0 check (exception_count >= 0),
  error_summary text,
  requested_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  external_id text not null unique,
  attendance_date date not null,
  scheduled_time_in time not null default '09:00',
  scheduled_time_out time not null default '18:00',
  time_in timestamptz,
  time_out timestamptz,
  worked_minutes integer not null default 0 check (worked_minutes >= 0),
  late_minutes integer not null default 0 check (late_minutes >= 0),
  undertime_minutes integer not null default 0 check (undertime_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  absence_minutes integer not null default 0 check (absence_minutes >= 0),
  classification public.attendance_classification not null,
  approved_leave boolean not null default false,
  source_updated_at timestamptz not null,
  sync_job_id uuid references public.integration_sync_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create table public.employee_compensation_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  base_salary numeric(12,2) not null check (base_salary >= 0),
  salary_frequency text not null default 'monthly' check (salary_frequency in ('monthly', 'semi_monthly', 'daily', 'hourly')),
  allowances jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to date,
  source text not null default 'ess' check (source in ('ess', 'compensation_review', 'manual')),
  external_id text,
  created_at timestamptz not null default now(),
  constraint employee_compensation_history_dates check (effective_to is null or effective_to >= effective_from),
  unique (employee_id, effective_from)
);

create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  source_type public.adjustment_source not null,
  source_entity_id text,
  code text not null,
  description text not null,
  quantity numeric(10,3) not null default 1,
  rate numeric(12,4) not null default 0,
  amount numeric(12,2) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (payroll_item_id, source_type, source_entity_id, code)
);

create table public.attendance_model_runs (
  id uuid primary key default gen_random_uuid(),
  model_name text not null default 'xgboost_attendance',
  model_version text not null,
  feature_schema_version text not null,
  period_start date not null,
  period_end date not null,
  records_scored integer not null default 0 check (records_scored >= 0),
  validation_accuracy numeric(6,5) check (validation_accuracy between 0 and 1),
  status text not null check (status in ('running', 'completed', 'failed')),
  artifact_reference text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  constraint attendance_model_runs_dates check (period_end >= period_start)
);

create table public.attendance_predictions (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid not null references public.attendance_model_runs(id) on delete cascade,
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  predicted_class public.attendance_classification not null,
  class_probability numeric(6,5) not null check (class_probability between 0 and 1),
  anomaly_score numeric(6,5) not null check (anomaly_score between 0 and 1),
  anomaly_reasons text[] not null default array[]::text[],
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_disposition text check (review_disposition in ('confirmed', 'dismissed', 'corrected')),
  created_at timestamptz not null default now(),
  unique (model_run_id, attendance_record_id)
);

alter table public.compensation_reviews add column if not exists applied_at timestamptz;
alter table public.compensation_reviews add column if not exists applied_payroll_run_id uuid references public.payroll_runs(id) on delete set null;
alter table public.claims add column if not exists ess_request_id text unique;
alter table public.claims add column if not exists verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'needs_review', 'missing_document'));
alter table public.claims add column if not exists verified_by uuid references public.profiles(id) on delete set null;
alter table public.claims add column if not exists verified_at timestamptz;
alter table public.claims add column if not exists included_payroll_run_id uuid references public.payroll_runs(id) on delete set null;
alter table public.employee_benefits add column if not exists ess_request_id text unique;
alter table public.employee_benefits add column if not exists applied_payroll_run_id uuid references public.payroll_runs(id) on delete set null;

create index attendance_records_employee_date_idx on public.attendance_records(employee_id, attendance_date desc);
create index attendance_records_classification_idx on public.attendance_records(attendance_date desc, classification);
create index integration_sync_jobs_created_idx on public.integration_sync_jobs(created_at desc, status);
create index compensation_history_effective_idx on public.employee_compensation_history(employee_id, effective_from desc);
create index payroll_adjustments_run_source_idx on public.payroll_adjustments(payroll_run_id, source_type);
create index attendance_predictions_employee_idx on public.attendance_predictions(employee_id, created_at desc);
create index attendance_predictions_anomaly_idx on public.attendance_predictions(anomaly_score desc) where anomaly_score >= 0.7;

create trigger set_ess_integrations_updated_at before update on public.ess_integrations for each row execute function public.set_updated_at();
create trigger set_attendance_records_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();

alter table public.ess_integrations enable row level security;
alter table public.integration_sync_jobs enable row level security;
alter table public.attendance_records enable row level security;
alter table public.employee_compensation_history enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.attendance_model_runs enable row level security;
alter table public.attendance_predictions enable row level security;

create policy "administrators read ESS integrations" on public.ess_integrations for select to authenticated using (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]));
create policy "super admins manage ESS integrations" on public.ess_integrations for all to authenticated using (public.has_any_role(array['super_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin']::public.app_role[]));
create policy "administrators read sync jobs" on public.integration_sync_jobs for select to authenticated using (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]));
create policy "administrators create sync jobs" on public.integration_sync_jobs for insert to authenticated with check (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) and requested_by = auth.uid());

create policy "users read permitted attendance" on public.attendance_records for select to authenticated using (public.can_access_employee(employee_id));
create policy "administrators manage attendance" on public.attendance_records for all to authenticated using (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]));
create policy "users read permitted compensation history" on public.employee_compensation_history for select to authenticated using (public.can_access_employee(employee_id));
create policy "hr roles manage compensation history" on public.employee_compensation_history for all to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]));

create policy "users read permitted payroll adjustments" on public.payroll_adjustments for select to authenticated using (public.can_access_employee(employee_id));
create policy "payroll roles manage adjustments" on public.payroll_adjustments for all to authenticated using (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]));
create policy "hr roles read model runs" on public.attendance_model_runs for select to authenticated using (public.has_any_role(array['super_admin','hr_admin','payroll_manager','hr_manager','manager']::public.app_role[]));
create policy "administrators manage model runs" on public.attendance_model_runs for all to authenticated using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));
create policy "users read permitted attendance predictions" on public.attendance_predictions for select to authenticated using (public.can_access_employee(employee_id));
create policy "hr roles review attendance predictions" on public.attendance_predictions for update to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]));

comment on table public.payroll_adjustments is 'Idempotent, auditable payroll inputs produced by attendance, benefits, claims, compensation, or authorized manual adjustments.';
comment on table public.attendance_predictions is 'XGBoost classification and anomaly outputs. Predictions inform review and never directly change payroll without an approved adjustment.';
