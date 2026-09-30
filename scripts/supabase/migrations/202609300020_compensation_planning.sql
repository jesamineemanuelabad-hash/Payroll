create table public.employee_credentials (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  credential_name text not null check (length(btrim(credential_name)) between 2 and 160),
  issuing_organization text,
  earned_on date,
  expires_on date,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected')),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint employee_credentials_dates_valid check (expires_on is null or earned_on is null or expires_on >= earned_on)
);

create table public.job_position_credential_criteria (
  id uuid primary key default gen_random_uuid(),
  job_position_id uuid not null references public.job_positions(id) on delete cascade,
  credential_name text not null check (length(btrim(credential_name)) between 2 and 160),
  criterion_type text not null check (criterion_type in ('required','preferred')),
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index employee_credentials_employee_idx
  on public.employee_credentials(employee_id, verification_status);
create index job_position_credential_criteria_position_idx
  on public.job_position_credential_criteria(job_position_id);
create unique index job_position_credential_criteria_name_unique
  on public.job_position_credential_criteria(job_position_id,lower(btrim(credential_name)));

alter table public.employee_credentials enable row level security;
alter table public.job_position_credential_criteria enable row level security;
revoke all on public.employee_credentials, public.job_position_credential_criteria from public, anon, authenticated;
grant all on public.employee_credentials, public.job_position_credential_criteria to service_role;

create or replace function public.compensation_planning_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null
    or not public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) then
    raise exception 'Only HR administrators can view compensation planning' using errcode='42501';
  end if;

  with active_employees as (
    select p.id,p.employee_number,p.first_name,p.last_name,p.department_id,p.job_title
    from public.profiles p
    where p.is_payroll_employee
      and not p.is_system_owner
      and p.employment_status='active'
      and lower(btrim(p.job_title)) not like 'system admin%'
  ),
  employees_with_data as (
    select e.*,
      d.name as department_name,
      pos.id as position_id,
      pos.salary_min,
      pos.salary_max,
      pos.salary_max_open,
      history.base_salary,
      history.salary_frequency,
      case history.salary_frequency
        when 'semi_monthly' then history.base_salary*2
        when 'daily' then history.base_salary*22
        when 'hourly' then history.base_salary*176
        else history.base_salary
      end as monthly_salary,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',c.id,
          'name',c.credential_name,
          'issuingOrganization',c.issuing_organization,
          'earnedOn',c.earned_on,
          'expiresOn',c.expires_on,
          'verificationStatus',c.verification_status
        ) order by c.credential_name)
        from public.employee_credentials c
        where c.employee_id=e.id
      ),'[]'::jsonb) as credentials,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',criterion.id,
          'credentialName',criterion.credential_name,
          'criterionType',criterion.criterion_type,
          'notes',criterion.notes
        ) order by criterion.criterion_type,criterion.credential_name)
        from public.job_position_credential_criteria criterion
        where criterion.job_position_id=pos.id
      ),'[]'::jsonb) as criteria
    from active_employees e
    left join public.departments d on d.id=e.department_id
    left join public.job_positions pos
      on pos.department_id=e.department_id
      and lower(btrim(pos.title))=lower(btrim(e.job_title))
    left join lateral (
      select h.base_salary,h.salary_frequency
      from public.employee_compensation_history h
      where h.employee_id=e.id
        and h.effective_from<=current_date
        and (h.effective_to is null or h.effective_to>=current_date)
      order by h.effective_from desc
      limit 1
    ) history on true
  )
  select jsonb_build_object(
    'employees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,
        'employeeNumber',e.employee_number,
        'name',concat_ws(' ',e.first_name,e.last_name),
        'department',e.department_name,
        'position',e.job_title,
        'positionId',e.position_id,
        'salaryAmount',e.base_salary,
        'salaryFrequency',e.salary_frequency,
        'monthlySalary',e.monthly_salary,
        'salaryMin',e.salary_min,
        'salaryMax',e.salary_max,
        'salaryMaxOpen',e.salary_max_open,
        'credentials',e.credentials,
        'criteria',e.criteria
      ) order by e.last_name,e.first_name,e.employee_number)
      from employees_with_data e
    ),'[]'::jsonb),
    'positions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',p.id,
        'title',p.title,
        'department',d.name
      ) order by d.name,p.title)
      from public.job_positions p
      join public.departments d on d.id=p.department_id
    ),'[]'::jsonb),
    'cycles',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',cycle.id,
        'name',cycle.name,
        'startsOn',cycle.starts_on,
        'endsOn',cycle.ends_on,
        'status',cycle.status
      ) order by cycle.starts_on desc,cycle.name)
      from public.compensation_cycles cycle
      where cycle.status in ('draft','active')
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.save_employee_credential(
  p_employee_id uuid,
  p_credential_name text,
  p_issuing_organization text,
  p_earned_on date,
  p_expires_on date,
  p_verification_status text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare saved public.employee_credentials;
begin
  if auth.uid() is null
    or not public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) then
    raise exception 'Only HR administrators can manage employee credentials' using errcode='42501';
  end if;
  if p_credential_name is null or length(btrim(p_credential_name)) not between 2 and 160
    or p_verification_status not in ('pending','verified','rejected')
    or (p_expires_on is not null and p_earned_on is not null and p_expires_on<p_earned_on) then
    raise exception 'Enter a valid credential name, verification status, and date range' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id=p_employee_id and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status='active'
  ) then
    raise exception 'Select an active payroll employee' using errcode='23503';
  end if;

  insert into public.employee_credentials(
    employee_id,credential_name,issuing_organization,earned_on,expires_on,
    verification_status,notes,created_by
  ) values (
    p_employee_id,btrim(p_credential_name),nullif(btrim(p_issuing_organization),''),
    p_earned_on,p_expires_on,p_verification_status,nullif(btrim(p_notes),''),auth.uid()
  ) returning * into saved;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(auth.uid(),'credential_recorded','employee_credentials',saved.id::text,
    jsonb_build_object('employee_id',saved.employee_id,'credential_name',saved.credential_name,
      'verification_status',saved.verification_status,'expires_on',saved.expires_on));

  return to_jsonb(saved);
end;
$$;

create or replace function public.save_position_credential_criterion(
  p_job_position_id uuid,
  p_credential_name text,
  p_criterion_type text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare saved public.job_position_credential_criteria;
begin
  if auth.uid() is null
    or not public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) then
    raise exception 'Only HR administrators can manage position criteria' using errcode='42501';
  end if;
  if p_credential_name is null or length(btrim(p_credential_name)) not between 2 and 160
    or p_criterion_type not in ('required','preferred') then
    raise exception 'Enter a valid credential name and criterion type' using errcode='22023';
  end if;
  if not exists(select 1 from public.job_positions where id=p_job_position_id) then
    raise exception 'Select a valid position' using errcode='23503';
  end if;

  insert into public.job_position_credential_criteria(
    job_position_id,credential_name,criterion_type,notes,created_by
  ) values (
    p_job_position_id,btrim(p_credential_name),p_criterion_type,nullif(btrim(p_notes),''),auth.uid()
  ) returning * into saved;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(auth.uid(),'position_credential_criterion_created','job_position_credential_criteria',saved.id::text,
    jsonb_build_object('job_position_id',saved.job_position_id,'credential_name',saved.credential_name,
      'criterion_type',saved.criterion_type));

  return to_jsonb(saved);
end;
$$;

revoke all on function public.compensation_planning_snapshot() from public,anon,authenticated;
revoke all on function public.save_employee_credential(uuid,text,text,date,date,text,text) from public,anon,authenticated;
revoke all on function public.save_position_credential_criterion(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.compensation_planning_snapshot() to authenticated;
grant execute on function public.save_employee_credential(uuid,text,text,date,date,text,text) to authenticated;
grant execute on function public.save_position_credential_criterion(uuid,text,text,text) to authenticated;
