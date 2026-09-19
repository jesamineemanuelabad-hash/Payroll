-- Effective-dated company payroll policy, Pag-IBIG, premium overtime,
-- night differential, validation cases, and approval gates.

create table public.payroll_policy_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null unique,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  workdays_per_month numeric(6,3) not null default 22 check (workdays_per_month between 1 and 31),
  hours_per_day numeric(5,2) not null default 8 check (hours_per_day between 1 and 24),
  ordinary_ot_multiplier numeric(6,3) not null default 1.25 check (ordinary_ot_multiplier >= 1),
  rest_day_ot_multiplier numeric(6,3) not null default 1.69 check (rest_day_ot_multiplier >= 1),
  special_day_ot_multiplier numeric(6,3) not null default 1.69 check (special_day_ot_multiplier >= 1),
  regular_holiday_ot_multiplier numeric(6,3) not null default 2.60 check (regular_holiday_ot_multiplier >= 1),
  double_holiday_ot_multiplier numeric(6,3) not null default 3.90 check (double_holiday_ot_multiplier >= 1),
  night_differential_rate numeric(6,4) not null default .10 check (night_differential_rate between 0 and 1),
  contribution_allocation text not null default 'split_evenly' check (contribution_allocation in ('split_evenly','first_cutoff','second_cutoff')),
  sss_employee_rate numeric(6,4) not null default .05,
  sss_employer_rate numeric(6,4) not null default .10,
  sss_min_msc numeric(12,2) not null default 5000,
  sss_max_msc numeric(12,2) not null default 35000,
  philhealth_rate numeric(6,4) not null default .05,
  philhealth_floor numeric(12,2) not null default 10000,
  philhealth_ceiling numeric(12,2) not null default 100000,
  pagibig_low_rate numeric(6,4) not null default .01,
  pagibig_high_rate numeric(6,4) not null default .02,
  pagibig_employer_rate numeric(6,4) not null default .02,
  pagibig_rate_threshold numeric(12,2) not null default 1500,
  pagibig_salary_cap numeric(12,2) not null default 10000,
  comparison_tolerance numeric(12,2) not null default 1 check (comparison_tolerance >= 0),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_policy_dates_valid check (effective_to is null or effective_to >= effective_from),
  constraint payroll_policy_statutory_values_valid check (
    sss_employee_rate between 0 and 1 and sss_employer_rate between 0 and 1 and sss_min_msc >= 0 and sss_max_msc >= sss_min_msc
    and philhealth_rate between 0 and 1 and philhealth_floor >= 0 and philhealth_ceiling >= philhealth_floor
    and pagibig_low_rate between 0 and 1 and pagibig_high_rate between 0 and 1 and pagibig_employer_rate between 0 and 1
    and pagibig_rate_threshold >= 0 and pagibig_salary_cap >= 0
  ),
  constraint payroll_policy_approval_valid check (status <> 'active' or version='PH-2025-BIR-2023-v2' or (approved_by is not null and approved_at is not null))
);
create index payroll_policy_effective_idx on public.payroll_policy_versions(status,effective_from,effective_to);
create trigger set_payroll_policy_updated_at before update on public.payroll_policy_versions for each row execute function public.set_updated_at();
create trigger audit_record after insert or update or delete on public.payroll_policy_versions for each row execute function public.audit_record_change();

insert into public.payroll_policy_versions(name,version,effective_from,status,approved_at)
values('Philippine payroll defaults','PH-2025-BIR-2023-v2','2025-01-01','active',now())
on conflict(version) do nothing;

alter table public.payroll_policy_versions enable row level security;
create policy "payroll roles read payroll policy" on public.payroll_policy_versions for select to authenticated
using (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]));
revoke insert,update,delete on public.payroll_policy_versions from public,anon,authenticated;

alter table public.attendance_records
  add column if not exists work_day_type text not null default 'ordinary',
  add column if not exists night_minutes integer not null default 0;
alter table public.attendance_records add constraint attendance_work_day_type_valid
  check (work_day_type in ('ordinary','rest_day','special_non_working','regular_holiday','double_holiday'));
alter table public.attendance_records add constraint attendance_night_minutes_valid check (night_minutes >= 0 and night_minutes <= worked_minutes + overtime_minutes);

alter table public.payroll_runs
  add column if not exists policy_version_id uuid references public.payroll_policy_versions(id) on delete restrict,
  add column if not exists validation_status text not null default 'not_run',
  add column if not exists validated_at timestamptz,
  add column if not exists locked_at timestamptz;
alter table public.payroll_runs add constraint payroll_validation_status_valid check (validation_status in ('not_run','passed','failed'));

alter table public.payroll_items
  add column if not exists ordinary_overtime_minutes integer not null default 0,
  add column if not exists rest_day_overtime_minutes integer not null default 0,
  add column if not exists special_day_overtime_minutes integer not null default 0,
  add column if not exists regular_holiday_overtime_minutes integer not null default 0,
  add column if not exists double_holiday_overtime_minutes integer not null default 0,
  add column if not exists night_minutes integer not null default 0,
  add column if not exists night_differential numeric(12,2) not null default 0,
  add column if not exists pagibig_employee numeric(12,2) not null default 0,
  add column if not exists pagibig_employer numeric(12,2) not null default 0;

create table public.payroll_validation_cases (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  source_reference text not null,
  expected_gross numeric(12,2) not null check (expected_gross >= 0),
  expected_deductions numeric(12,2) not null check (expected_deductions >= 0),
  expected_net numeric(12,2) not null check (expected_net >= 0),
  notes text,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(payroll_run_id,employee_id)
);
create index payroll_validation_cases_run_idx on public.payroll_validation_cases(payroll_run_id);
create trigger set_payroll_validation_cases_updated_at before update on public.payroll_validation_cases for each row execute function public.set_updated_at();
create trigger audit_record after insert or update or delete on public.payroll_validation_cases for each row execute function public.audit_record_change();
create trigger require_payroll_employee before insert or update of employee_id on public.payroll_validation_cases for each row execute function public.require_payroll_employee();
alter table public.payroll_validation_cases enable row level security;
create policy "payroll roles read validation cases" on public.payroll_validation_cases for select to authenticated
using (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]));
revoke insert,update,delete on public.payroll_validation_cases from public,anon,authenticated;

create or replace function public.payroll_contribution_factor(p_schedule text,p_allocation text)
returns numeric language sql immutable set search_path='' as $$
  select case
    when p_schedule='monthly' then 1
    when p_allocation='split_evenly' then .5
    when p_allocation='first_cutoff' and p_schedule='first_cutoff' then 1
    when p_allocation='second_cutoff' and p_schedule='second_cutoff' then 1
    else 0 end::numeric;
$$;

create or replace function public.payroll_policy_for(p_date date)
returns public.payroll_policy_versions language plpgsql stable security definer set search_path='' as $$
declare result public.payroll_policy_versions;
begin
  select * into result from public.payroll_policy_versions
  where status='active' and effective_from<=p_date and (effective_to is null or effective_to>=p_date)
  order by effective_from desc,created_at desc limit 1;
  if not found then raise exception 'No active payroll policy covers %',p_date; end if;
  return result;
end $$;

create or replace function public.payroll_sss_msc(p_policy_id uuid,p_monthly_salary numeric)
returns numeric language sql stable security definer set search_path='' as $$
  select greatest(p.sss_min_msc,least(p.sss_max_msc,floor((greatest(p_monthly_salary,0)+250)/500)*500))
  from public.payroll_policy_versions p where p.id=p_policy_id;
$$;

create or replace function public.guard_payroll_policy()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and exists(select 1 from public.payroll_runs where policy_version_id=old.id) then
    raise exception 'A policy used by payroll cannot be deleted';
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.payroll_runs where policy_version_id=old.id and status<>'draft') then
    if (to_jsonb(new)-'updated_at'-'effective_to') is distinct from (to_jsonb(old)-'updated_at'-'effective_to')
       or new.effective_to is null
       or new.effective_to < (select max(period_end) from public.payroll_runs where policy_version_id=old.id and status<>'draft') then
      raise exception 'A policy used by finalized payroll is immutable except for closing its future effective range';
    end if;
  end if;
  if tg_op<>'DELETE' and new.status='active' and exists(
    select 1 from public.payroll_policy_versions p where p.id<>new.id and p.status='active'
      and daterange(p.effective_from,p.effective_to,'[]')&&daterange(new.effective_from,new.effective_to,'[]')
  ) then raise exception 'Active payroll policy effective dates cannot overlap'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger guard_payroll_policy before insert or update or delete on public.payroll_policy_versions for each row execute function public.guard_payroll_policy();

create or replace function public.save_payroll_policy(p_policy jsonb,p_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.payroll_policy_versions; current_status text;
begin
  if not public.has_any_role(array['super_admin']::public.app_role[]) then raise exception 'Only a super administrator can configure payroll policy' using errcode='42501'; end if;
  if jsonb_typeof(p_policy)<>'object' then raise exception 'Invalid payroll policy'; end if;
  if p_id is null then
    insert into public.payroll_policy_versions(name,version,effective_from,effective_to,status,workdays_per_month,hours_per_day,
      ordinary_ot_multiplier,rest_day_ot_multiplier,special_day_ot_multiplier,regular_holiday_ot_multiplier,double_holiday_ot_multiplier,
      night_differential_rate,contribution_allocation,comparison_tolerance,sss_employee_rate,sss_employer_rate,sss_min_msc,sss_max_msc,
      philhealth_rate,philhealth_floor,philhealth_ceiling,pagibig_low_rate,pagibig_high_rate,pagibig_employer_rate,pagibig_rate_threshold,pagibig_salary_cap,approved_by,approved_at)
    values(btrim(p_policy->>'name'),btrim(p_policy->>'version'),(p_policy->>'effectiveFrom')::date,nullif(p_policy->>'effectiveTo','')::date,
      coalesce(p_policy->>'status','draft'),(p_policy->>'workdaysPerMonth')::numeric,(p_policy->>'hoursPerDay')::numeric,
      (p_policy->>'ordinaryOtMultiplier')::numeric,(p_policy->>'restDayOtMultiplier')::numeric,(p_policy->>'specialDayOtMultiplier')::numeric,
      (p_policy->>'regularHolidayOtMultiplier')::numeric,(p_policy->>'doubleHolidayOtMultiplier')::numeric,(p_policy->>'nightDifferentialRate')::numeric,
      p_policy->>'contributionAllocation',(p_policy->>'comparisonTolerance')::numeric,(p_policy->>'sssEmployeeRate')::numeric,(p_policy->>'sssEmployerRate')::numeric,
      (p_policy->>'sssMinMsc')::numeric,(p_policy->>'sssMaxMsc')::numeric,(p_policy->>'philhealthRate')::numeric,(p_policy->>'philhealthFloor')::numeric,
      (p_policy->>'philhealthCeiling')::numeric,(p_policy->>'pagibigLowRate')::numeric,(p_policy->>'pagibigHighRate')::numeric,(p_policy->>'pagibigEmployerRate')::numeric,
      (p_policy->>'pagibigRateThreshold')::numeric,(p_policy->>'pagibigSalaryCap')::numeric,
      case when p_policy->>'status'='active' then auth.uid() end,case when p_policy->>'status'='active' then now() end) returning * into saved;
  else
    select status into current_status from public.payroll_policy_versions where id=p_id for update;
    if not found then raise exception 'Payroll policy not found'; end if;
    update public.payroll_policy_versions set name=btrim(p_policy->>'name'),version=btrim(p_policy->>'version'),
      effective_from=(p_policy->>'effectiveFrom')::date,effective_to=nullif(p_policy->>'effectiveTo','')::date,status=coalesce(p_policy->>'status','draft'),
      workdays_per_month=(p_policy->>'workdaysPerMonth')::numeric,hours_per_day=(p_policy->>'hoursPerDay')::numeric,
      ordinary_ot_multiplier=(p_policy->>'ordinaryOtMultiplier')::numeric,rest_day_ot_multiplier=(p_policy->>'restDayOtMultiplier')::numeric,
      special_day_ot_multiplier=(p_policy->>'specialDayOtMultiplier')::numeric,regular_holiday_ot_multiplier=(p_policy->>'regularHolidayOtMultiplier')::numeric,
      double_holiday_ot_multiplier=(p_policy->>'doubleHolidayOtMultiplier')::numeric,night_differential_rate=(p_policy->>'nightDifferentialRate')::numeric,
      contribution_allocation=p_policy->>'contributionAllocation',comparison_tolerance=(p_policy->>'comparisonTolerance')::numeric,
      sss_employee_rate=(p_policy->>'sssEmployeeRate')::numeric,sss_employer_rate=(p_policy->>'sssEmployerRate')::numeric,
      sss_min_msc=(p_policy->>'sssMinMsc')::numeric,sss_max_msc=(p_policy->>'sssMaxMsc')::numeric,
      philhealth_rate=(p_policy->>'philhealthRate')::numeric,philhealth_floor=(p_policy->>'philhealthFloor')::numeric,philhealth_ceiling=(p_policy->>'philhealthCeiling')::numeric,
      pagibig_low_rate=(p_policy->>'pagibigLowRate')::numeric,pagibig_high_rate=(p_policy->>'pagibigHighRate')::numeric,pagibig_employer_rate=(p_policy->>'pagibigEmployerRate')::numeric,
      pagibig_rate_threshold=(p_policy->>'pagibigRateThreshold')::numeric,pagibig_salary_cap=(p_policy->>'pagibigSalaryCap')::numeric,
      approved_by=case when p_policy->>'status'='active' and current_status<>'active' then auth.uid() when p_policy->>'status'='active' then approved_by else null end,
      approved_at=case when p_policy->>'status'='active' and current_status<>'active' then now() when p_policy->>'status'='active' then approved_at else null end
    where id=p_id returning * into saved;
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function public.save_payroll_policy(jsonb,uuid) from public,anon;
grant execute on function public.save_payroll_policy(jsonb,uuid) to authenticated;

create or replace function public.payroll_policy_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.effective_from desc,p.created_at desc),'[]'::jsonb)
  from public.payroll_policy_versions p
  where public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]);
$$;
revoke all on function public.payroll_policy_snapshot() from public,anon;
grant execute on function public.payroll_policy_snapshot() to authenticated;

create or replace function public.guard_payroll_item()
returns trigger language plpgsql set search_path='' as $$
declare run_status public.payroll_status; itemized numeric;
begin
  select status into run_status from public.payroll_runs where id=case when tg_op='DELETE' then old.payroll_run_id else new.payroll_run_id end for update;
  if run_status is distinct from 'draft'::public.payroll_status then raise exception 'Only draft payroll entries can be changed'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and new.payroll_run_id<>old.payroll_run_id then raise exception 'Cannot move an entry to another run'; end if;
  if tg_op='INSERT' and new.other_deductions=0 and new.deductions<>0 then new.other_deductions:=new.deductions; end if;
  if tg_op='UPDATE' and new.deductions is distinct from old.deductions then
    new.other_deductions:=greatest(0,new.deductions-new.late_deduction-new.undertime_deduction-new.absence_deduction-new.sss_employee-new.philhealth_employee-new.pagibig_employee-new.withholding_tax-new.benefit_employee_deduction);
  end if;
  itemized:=new.late_deduction+new.undertime_deduction+new.absence_deduction+new.sss_employee+new.philhealth_employee+new.pagibig_employee+new.withholding_tax+new.benefit_employee_deduction+new.other_deductions;
  new.deductions:=round(itemized,2);
  new.contributions:=round(new.sss_employer+new.philhealth_employer+new.pagibig_employer+new.benefit_employer_contribution,2);
  new.gross_pay:=round(new.basic_salary+new.allowances+new.overtime+new.night_differential+new.bonus+new.attendance_adjustments+new.benefits+new.reimbursements,2);
  new.net_pay:=round(new.gross_pay-new.deductions,2);
  if new.net_pay<0 then raise exception 'Deductions exceed gross earnings'; end if;
  return new;
end $$;

create or replace function public.apply_configurable_payroll_policy(p_run_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; policy public.payroll_policy_versions; factor numeric;
begin
  select * into r from public.payroll_runs where id=p_run_id for update;
  policy:=public.payroll_policy_for(r.period_end);
  factor:=public.payroll_contribution_factor(r.schedule,policy.contribution_allocation);
  update public.payroll_runs set policy_version_id=policy.id,rule_version=policy.version,validation_status='not_run',validated_at=null where id=r.id;

  with attendance as (
    select i.employee_id,
      coalesce(sum(a.overtime_minutes) filter(where a.work_day_type='ordinary'),0)::integer ordinary_ot,
      coalesce(sum(a.overtime_minutes) filter(where a.work_day_type='rest_day'),0)::integer rest_ot,
      coalesce(sum(a.overtime_minutes) filter(where a.work_day_type='special_non_working'),0)::integer special_ot,
      coalesce(sum(a.overtime_minutes) filter(where a.work_day_type='regular_holiday'),0)::integer holiday_ot,
      coalesce(sum(a.overtime_minutes) filter(where a.work_day_type='double_holiday'),0)::integer double_ot,
      coalesce(sum(a.night_minutes),0)::integer night_mins
    from public.payroll_items i left join public.attendance_records a on a.employee_id=i.employee_id and a.attendance_date between r.period_start and r.period_end
    where i.payroll_run_id=r.id group by i.employee_id
  ), amounts as (
    select i.id,a.*,
      case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end)/policy.workdays_per_month
        when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2/policy.workdays_per_month
        when 'daily' then i.daily_rate else i.hourly_rate*policy.hours_per_day end new_daily,
      case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end)/(policy.workdays_per_month*policy.hours_per_day)
        when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2/(policy.workdays_per_month*policy.hours_per_day)
        when 'daily' then i.daily_rate/policy.hours_per_day else i.hourly_rate end new_hourly
    from public.payroll_items i join attendance a using(employee_id) where i.payroll_run_id=r.id
  )
  update public.payroll_items i set daily_rate=round(a.new_daily,4),hourly_rate=round(a.new_hourly,4),
    ordinary_overtime_minutes=a.ordinary_ot,rest_day_overtime_minutes=a.rest_ot,special_day_overtime_minutes=a.special_ot,
    regular_holiday_overtime_minutes=a.holiday_ot,double_holiday_overtime_minutes=a.double_ot,night_minutes=a.night_mins,
    overtime=round(a.new_hourly*(a.ordinary_ot*policy.ordinary_ot_multiplier+a.rest_ot*policy.rest_day_ot_multiplier+
      a.special_ot*policy.special_day_ot_multiplier+a.holiday_ot*policy.regular_holiday_ot_multiplier+a.double_ot*policy.double_holiday_ot_multiplier)/60,2),
    night_differential=round(a.new_hourly*a.night_mins*policy.night_differential_rate/60,2),
    late_deduction=round(a.new_hourly*i.late_minutes/60,2),undertime_deduction=round(a.new_hourly*i.undertime_minutes/60,2),
    absence_deduction=round(case when i.salary_frequency in ('monthly','semi_monthly') then a.new_hourly*i.absence_minutes/60 else 0 end,2),
    sss_employee=round(public.payroll_sss_msc(policy.id,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end)*policy.sss_employee_rate*factor,2),
    sss_employer=round(public.payroll_sss_msc(policy.id,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end)*policy.sss_employer_rate*factor + case when factor>0 then (case when public.payroll_sss_msc(policy.id,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end)<15000 then 10 else 30 end)*factor else 0 end,2),
    philhealth_employee=round(greatest(policy.philhealth_floor,least(policy.philhealth_ceiling,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end))*policy.philhealth_rate*.5*factor,2),
    philhealth_employer=round(greatest(policy.philhealth_floor,least(policy.philhealth_ceiling,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end))*policy.philhealth_rate*.5*factor,2),
    pagibig_employee=round(least(policy.pagibig_salary_cap,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end)*case when (case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end)<=policy.pagibig_rate_threshold then policy.pagibig_low_rate else policy.pagibig_high_rate end*factor,2),
    pagibig_employer=round(least(policy.pagibig_salary_cap,case i.salary_frequency when 'monthly' then i.basic_salary/(case when r.schedule='monthly' then 1 else .5 end) when 'semi_monthly' then i.basic_salary/(case when r.schedule='monthly' then 2 else 1 end)*2 when 'daily' then i.daily_rate*policy.workdays_per_month else i.hourly_rate*policy.workdays_per_month*policy.hours_per_day end)*policy.pagibig_employer_rate*factor,2),
    calculation_snapshot=i.calculation_snapshot||jsonb_build_object('policyId',policy.id,'ruleVersion',policy.version,'workdaysPerMonth',policy.workdays_per_month,'hoursPerDay',policy.hours_per_day,'contributionAllocation',policy.contribution_allocation,'nightDifferentialRate',policy.night_differential_rate)
  from amounts a where i.id=a.id;
  return policy.version;
end $$;
revoke all on function public.apply_configurable_payroll_policy(uuid) from public,anon,authenticated;

create or replace function public.validate_payroll_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; issues jsonb; comparison jsonb; passed boolean;
begin
  if not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot validate payroll' using errcode='42501'; end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into issues from (
    select jsonb_build_object('severity','error','code','not_calculated','message','Calculate payroll before validation') x where r.calculated_at is null
    union all select jsonb_build_object('severity','error','code','empty_run','message','Payroll has no included employees') where r.employee_count=0
    union all select jsonb_build_object('severity','error','code','needs_review','message',count(*)||' employee entries need review') from public.payroll_items where payroll_run_id=r.id and status='needs_review' having count(*)>0
    union all select jsonb_build_object('severity','warning','code','missing_attendance','message',count(*)||' daily/hourly employees have no attendance records') from public.payroll_items i where i.payroll_run_id=r.id and i.status<>'excluded' and i.salary_frequency in ('daily','hourly') and not exists(select 1 from public.attendance_records a where a.employee_id=i.employee_id and a.attendance_date between r.period_start and r.period_end) having count(*)>0
  ) q;
  select coalesce(jsonb_agg(jsonb_build_object('employeeId',c.employee_id,'sourceReference',c.source_reference,
    'grossDifference',round(i.gross_pay-c.expected_gross,2),'deductionDifference',round(i.deductions-c.expected_deductions,2),'netDifference',round(i.net_pay-c.expected_net,2),
    'passed',greatest(abs(i.gross_pay-c.expected_gross),abs(i.deductions-c.expected_deductions),abs(i.net_pay-c.expected_net))<=p.comparison_tolerance)),'[]'::jsonb)
  into comparison from public.payroll_validation_cases c join public.payroll_items i on i.payroll_run_id=c.payroll_run_id and i.employee_id=c.employee_id
  join public.payroll_policy_versions p on p.id=r.policy_version_id where c.payroll_run_id=r.id;
  passed:=not exists(select 1 from jsonb_array_elements(issues) x where x->>'severity'='error')
    and not exists(select 1 from jsonb_array_elements(comparison) x where not (x->>'passed')::boolean);
  update public.payroll_runs set validation_status=case when passed then 'passed' else 'failed' end,validated_at=now() where id=r.id;
  return jsonb_build_object('passed',passed,'issues',issues,'comparisons',comparison);
end $$;
revoke all on function public.validate_payroll_run(uuid) from public,anon;
grant execute on function public.validate_payroll_run(uuid) to authenticated;

-- Extend the existing calculator without changing historical finalized runs.
create or replace function public.calculate_payroll_run_complete(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; result jsonb; manual_bonuses jsonb; policy_version text; validation jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot calculate payroll' using errcode='42501'; end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  select coalesce(jsonb_object_agg(i.employee_id::text,greatest(0,i.bonus-coalesce((i.calculation_snapshot->>'compensationBonus')::numeric,0))),'{}'::jsonb) into manual_bonuses
  from public.payroll_items i where i.payroll_run_id=p_run_id;
  result:=public.calculate_payroll_run(p_run_id);
  policy_version:=public.apply_configurable_payroll_policy(p_run_id);
  with review_bonus as (
    select i.id,i.employee_id,coalesce((manual_bonuses->>i.employee_id::text)::numeric,0) manual_bonus,
      coalesce(sum(cr.bonus) filter(where cr.id is not null),0) compensation_bonus
    from public.payroll_items i left join public.compensation_reviews cr on cr.employee_id=i.employee_id and cr.status='approved' and cr.applied_at is not null
      and (cr.applied_payroll_run_id is null or cr.applied_payroll_run_id=p_run_id)
      and exists(select 1 from public.compensation_cycles cc where cc.id=cr.cycle_id and cc.ends_on<r.period_end)
    where i.payroll_run_id=p_run_id group by i.id,i.employee_id
  ), amounts as (
    select i.id,b.manual_bonus+b.compensation_bonus new_bonus,b.compensation_bonus,
      greatest(0,i.basic_salary+i.allowances+i.overtime+i.night_differential+b.manual_bonus+b.compensation_bonus-i.sss_employee-i.philhealth_employee-i.pagibig_employee) taxable
    from public.payroll_items i join review_bonus b on b.id=i.id
  )
  update public.payroll_items i set bonus=a.new_bonus,taxable_compensation=round(a.taxable,2),withholding_tax=public.bir_withholding_tax(a.taxable,r.schedule),
    calculation_snapshot=i.calculation_snapshot||jsonb_build_object('compensationBonus',a.compensation_bonus)
  from amounts a where i.id=a.id;
  update public.compensation_reviews cr set applied_payroll_run_id=p_run_id where cr.status='approved' and cr.applied_at is not null and cr.bonus>0 and cr.applied_payroll_run_id is null
    and exists(select 1 from public.payroll_items i where i.payroll_run_id=p_run_id and i.employee_id=cr.employee_id)
    and exists(select 1 from public.compensation_cycles cc where cc.id=cr.cycle_id and cc.ends_on<r.period_end);
  update public.payroll_runs set calculated_at=now(),rule_version=policy_version,validation_status='not_run',validated_at=null where id=p_run_id;
  validation:=public.validate_payroll_run(p_run_id);
  return jsonb_build_object('runId',p_run_id,'employees',(select employee_count from public.payroll_runs where id=p_run_id),'ruleVersion',policy_version,'validation',validation);
end $$;

create or replace function public.transition_payroll_run(p_run_id uuid,p_target public.payroll_status)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; saved jsonb; validation jsonb;
begin
  if auth.uid() is null or not public.has_workspace_access() then raise exception 'Sign in with an active account' using errcode='42501'; end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if r.status='draft' and p_target='pending_approval' then
    if not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot submit payroll'; end if;
    validation:=public.validate_payroll_run(r.id);
    if not (validation->>'passed')::boolean then raise exception 'Payroll validation failed. Resolve validation issues before submission'; end if;
    if exists(select 1 from public.payroll_items where payroll_run_id=r.id and updated_at>r.calculated_at)
      or exists(select 1 from public.attendance_records a join public.payroll_items i on i.employee_id=a.employee_id and i.payroll_run_id=r.id where a.attendance_date between r.period_start and r.period_end and a.updated_at>r.calculated_at)
      or exists(select 1 from public.leave_requests l join public.payroll_items i on i.employee_id=l.employee_id and i.payroll_run_id=r.id where daterange(l.start_date,l.end_date,'[]')&&daterange(r.period_start,r.period_end,'[]') and l.updated_at>r.calculated_at)
      or exists(select 1 from public.employee_compensation_history h join public.payroll_items i on i.employee_id=h.employee_id and i.payroll_run_id=r.id where daterange(h.effective_from,h.effective_to,'[]')&&daterange(r.period_start,r.period_end,'[]') and h.updated_at>r.calculated_at)
      or exists(select 1 from public.employee_benefits b join public.payroll_items i on i.employee_id=b.employee_id and i.payroll_run_id=r.id where b.updated_at>r.calculated_at)
      or exists(select 1 from public.claims c join public.payroll_items i on i.employee_id=c.employee_id and i.payroll_run_id=r.id where c.updated_at>r.calculated_at)
      then raise exception 'Payroll inputs changed after calculation. Recalculate before submission'; end if;
  elsif r.status='pending_approval' and p_target='approved' then
    if not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then raise exception 'An HR or super administrator must approve payroll'; end if;
  elsif r.status='pending_approval' and p_target='draft' then
    if not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot return payroll for revision'; end if;
  elsif r.status='approved' and p_target='paid' then
    if not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot mark payroll as paid'; end if;
  else raise exception 'Invalid payroll transition from % to %',r.status,p_target; end if;
  update public.payroll_runs set status=p_target,
    approved_by=case when p_target='approved' then auth.uid() when p_target='draft' then null else approved_by end,
    approved_at=case when p_target='approved' then now() when p_target='draft' then null else approved_at end,
    locked_at=case when p_target='approved' then now() when p_target='draft' then null else locked_at end,
    validation_status=case when p_target='draft' then 'not_run' else validation_status end,
    updated_at=clock_timestamp() where id=r.id returning to_jsonb(public.payroll_runs.*) into saved;
  return saved;
end $$;

create or replace function public.record_definition(entity text) returns jsonb language plpgsql immutable set search_path='' as $$
declare fields text; roles text:='super_admin,hr_admin';
begin
  case entity
    when 'departments' then fields:='name,code';
    when 'profiles' then fields:='employee_number,first_name,last_name,email,department_id,job_title,location,hired_at';
    when 'attendance_records' then fields:='employee_id,external_id,attendance_date,time_in,time_out,worked_minutes,late_minutes,undertime_minutes,overtime_minutes,absence_minutes,night_minutes,work_day_type,classification,approved_leave'; roles:='super_admin,hr_admin,payroll_manager';
    when 'leave_requests' then fields:='employee_id,leave_type,start_date,end_date,total_days,is_paid,reason,status,rejection_reason'; roles:='super_admin,hr_admin,hr_manager';
    when 'compensation_cycles' then fields:='name,starts_on,ends_on,budget,status'; roles:='super_admin,hr_admin,hr_manager';
    when 'compensation_reviews' then fields:='employee_id,cycle_id,current_salary,proposed_salary,bonus,justification,status'; roles:='super_admin,hr_admin,hr_manager';
    when 'employee_compensation_history' then fields:='employee_id,base_salary,salary_frequency,effective_from,effective_to'; roles:='super_admin,hr_admin,hr_manager';
    when 'benefit_providers' then fields:='name,status';
    when 'benefit_plans' then fields:='provider_id,name,description,benefit_type,employee_cost,employer_cost,coverage_type,status';
    when 'employee_benefits' then fields:='employee_id,plan_id,membership_number,effective_date,expiration_date,eligibility,status';
    when 'claims' then fields:='employee_id,claim_number,category,description,amount,receipt_url,verification_status,status,rejection_reason'; roles:='super_admin,hr_admin,hr_manager';
    when 'payroll_runs' then fields:='period_start,period_end,pay_date'; roles:='super_admin,payroll_manager';
    when 'payroll_items' then fields:='payroll_run_id,employee_id,basic_salary,allowances,overtime,attendance_adjustments,benefits,reimbursements,deductions,contributions,bonus,other_deductions,status'; roles:='super_admin,payroll_manager';
    when 'payroll_validation_cases' then fields:='payroll_run_id,employee_id,source_reference,expected_gross,expected_deductions,expected_net,notes'; roles:='super_admin,payroll_manager';
    else raise exception 'Unknown record type' using errcode='22023';
  end case;
  return jsonb_build_object('fields',to_jsonb(string_to_array(fields,',')),'roles',to_jsonb(string_to_array(roles,',')));
end $$;

create or replace function public.payroll_run_report(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view payroll reports' using errcode='42501'; end if;
  if not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[])
     and not exists(select 1 from public.payroll_items where payroll_run_id=p_run_id and employee_id=auth.uid()) then
    raise exception 'Your role cannot view this report' using errcode='42501';
  end if;
  select jsonb_build_object('run',to_jsonb(r)||jsonb_build_object('policy_name',p.name,'policy_version',p.version),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'employeeId',i.employee_id,'employeeNumber',e.employee_number,'employeeName',e.first_name||' '||e.last_name,'department',coalesce(d.name,'Unassigned'),
      'salaryFrequency',i.salary_frequency,'dailyRate',i.daily_rate,'hourlyRate',i.hourly_rate,'workedDays',i.worked_days,'paidLeaveDays',i.paid_leave_days,
      'lateMinutes',i.late_minutes,'undertimeMinutes',i.undertime_minutes,'absenceMinutes',i.absence_minutes,'overtimeMinutes',i.overtime_minutes,
      'ordinaryOvertimeMinutes',i.ordinary_overtime_minutes,'restDayOvertimeMinutes',i.rest_day_overtime_minutes,'specialDayOvertimeMinutes',i.special_day_overtime_minutes,
      'regularHolidayOvertimeMinutes',i.regular_holiday_overtime_minutes,'doubleHolidayOvertimeMinutes',i.double_holiday_overtime_minutes,
      'nightMinutes',i.night_minutes,'nightDifferential',i.night_differential,
      'basicSalary',i.basic_salary,'allowances',i.allowances,'overtimePay',i.overtime,'bonus',i.bonus,'benefits',i.benefits,'reimbursements',i.reimbursements,'grossPay',i.gross_pay,
      'lateDeduction',i.late_deduction,'undertimeDeduction',i.undertime_deduction,'absenceDeduction',i.absence_deduction,'sssEmployee',i.sss_employee,
      'philhealthEmployee',i.philhealth_employee,'pagibigEmployee',i.pagibig_employee,'withholdingTax',i.withholding_tax,'benefitDeduction',i.benefit_employee_deduction,
      'otherDeductions',i.other_deductions,'totalDeductions',i.deductions,'sssEmployer',i.sss_employer,'philhealthEmployer',i.philhealth_employer,
      'pagibigEmployer',i.pagibig_employer,'benefitEmployer',i.benefit_employer_contribution,'employerContributions',i.contributions,'netPay',i.net_pay,
      'status',i.status,'calculation',i.calculation_snapshot) order by e.last_name,e.first_name)
      from public.payroll_items i join public.profiles e on e.id=i.employee_id left join public.departments d on d.id=e.department_id
      where i.payroll_run_id=r.id and (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) or i.employee_id=auth.uid())),'[]'::jsonb))
  into result from public.payroll_runs r left join public.payroll_policy_versions p on p.id=r.policy_version_id where r.id=p_run_id;
  if result is null then raise exception 'Payroll run not found'; end if;
  return result;
end $$;

comment on table public.payroll_policy_versions is 'Effective-dated, approved company and statutory payroll assumptions. Historical runs retain their policy reference.';
comment on function public.validate_payroll_run(uuid) is 'Runs pre-approval integrity checks and optional historical payslip comparisons.';
