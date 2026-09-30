alter table public.job_position_credential_criteria
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_job_position_credential_criteria_updated_at
  on public.job_position_credential_criteria;
create trigger set_job_position_credential_criteria_updated_at
  before update on public.job_position_credential_criteria
  for each row execute function public.set_updated_at();

drop trigger if exists audit_job_position_credential_criteria
  on public.job_position_credential_criteria;
create trigger audit_job_position_credential_criteria
  after insert or update or delete on public.job_position_credential_criteria
  for each row execute function public.audit_record_change();

drop trigger if exists audit_job_positions
  on public.job_positions;
create trigger audit_job_positions
  after insert or update or delete on public.job_positions
  for each row execute function public.audit_record_change();

create or replace function public.set_credential_criterion_creator()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.created_by is null then
    new.created_by:=auth.uid();
  end if;
  if new.created_by is null then
    raise exception 'A credential criterion must have an author' using errcode='23502';
  end if;
  return new;
end;
$$;

drop trigger if exists set_credential_criterion_creator
  on public.job_position_credential_criteria;
create trigger set_credential_criterion_creator
  before insert on public.job_position_credential_criteria
  for each row execute function public.set_credential_criterion_creator();

grant select on public.job_position_credential_criteria to authenticated;
drop policy if exists "HR reads position credential criteria"
  on public.job_position_credential_criteria;
create policy "HR reads position credential criteria"
  on public.job_position_credential_criteria
  for select to authenticated
  using (public.has_any_role(array['super_admin','hr_admin']::public.app_role[]));

create or replace function public.record_definition(entity text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare fields text; roles text:='super_admin,hr_admin';
begin
  case entity
    when 'departments' then fields:='name,code';
    when 'profiles' then fields:='employee_number,first_name,last_name,email,department_id,job_title,location,hired_at';
    when 'attendance_records' then fields:='employee_id,external_id,attendance_date,time_in,time_out,worked_minutes,late_minutes,undertime_minutes,overtime_minutes,absence_minutes,night_minutes,work_day_type,classification,approved_leave'; roles:='super_admin,hr_admin,payroll_manager';
    when 'leave_requests' then fields:='employee_id,leave_type,start_date,end_date,total_days,is_paid,reason,status,rejection_reason'; roles:='super_admin,hr_admin,hr_manager';
    when 'compensation_cycles' then fields:='name,starts_on,ends_on,budget,status'; roles:='super_admin,hr_admin,hr_manager';
    when 'compensation_reviews' then fields:='employee_id,cycle_id,current_salary,proposed_salary,bonus,effective_date,justification,status'; roles:='super_admin,hr_admin,hr_manager,payroll_manager';
    when 'employee_compensation_history' then fields:='employee_id,base_salary,salary_frequency,effective_from,effective_to'; roles:='super_admin,hr_admin,hr_manager';
    when 'benefit_providers' then fields:='name,status';
    when 'benefit_plans' then fields:='provider_id,name,description,benefit_type,employee_cost,employer_cost,coverage_type,status';
    when 'employee_benefits' then fields:='employee_id,plan_id,membership_number,effective_date,expiration_date,eligibility,status';
    when 'claims' then fields:='employee_id,claim_number,category,expense_date,description,requested_amount,approved_amount,receipt_url,verification_status,status,rejection_reason'; roles:='super_admin,hr_admin,hr_manager,payroll_manager';
    when 'payroll_runs' then fields:='period_start,period_end,pay_date'; roles:='super_admin,payroll_manager';
    when 'payroll_items' then fields:='payroll_run_id,employee_id,basic_salary,allowances,overtime,attendance_adjustments,benefits,reimbursements,deductions,contributions,bonus,other_deductions,status'; roles:='super_admin,payroll_manager';
    when 'payroll_validation_cases' then fields:='payroll_run_id,employee_id,source_reference,expected_gross,expected_deductions,expected_net,notes'; roles:='super_admin,payroll_manager';
    when 'job_positions' then fields:='title,department_id,salary_min,salary_max'; roles:='super_admin,hr_admin';
    when 'job_position_credential_criteria' then fields:='job_position_id,credential_name,criterion_type,notes'; roles:='super_admin,hr_admin';
    else raise exception 'Unknown record type' using errcode='22023';
  end case;
  return jsonb_build_object('fields',to_jsonb(string_to_array(fields,',')),'roles',to_jsonb(string_to_array(roles,',')));
end;
$$;

create or replace function public.seed_demo_credentials()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  author_id uuid;
  criteria_added integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Only a service-role caller can seed demo position criteria' using errcode='42501';
  end if;

  select ur.user_id into author_id
  from public.user_roles ur
  where ur.role in ('super_admin','hr_admin')
  order by case ur.role when 'super_admin' then 0 else 1 end,ur.created_at
  limit 1;
  if author_id is null then
    raise exception 'Create an HR or super administrator before seeding position criteria' using errcode='23503';
  end if;

  with rules(department_code,title_pattern,credential_name,criterion_type,notes) as (
    values
      ('ENG','%senior%','AWS Certified Solutions Architect','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%senior%','Professional Scrum Master (PSM I)','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%lead%','AWS Certified Solutions Architect','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%lead%','Certified Kubernetes Administrator','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%junior%','CompTIA A+ Certification','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%devops%','HashiCorp Certified Terraform Associate','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%infrastructure%','AWS Certified Solutions Architect','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%platform%','Certified Kubernetes Administrator','preferred','Demo suggestion; confirm relevance with HR.'),
      ('ENG','%qa%','ISTQB Certified Tester','preferred','Demo suggestion; confirm relevance with HR.'),
      ('FIN','%','Certified Public Accountant (CPA)','preferred','Demo suggestion; verify position-specific licensing requirements with HR.'),
      ('PEO','%','CHRP – Certified Human Resource Professional','preferred','Demo suggestion; confirm relevance with HR.'),
      ('SAL','%senior%','Certified Professional Sales Person (CPSP)','preferred','Demo suggestion; confirm relevance with HR.'),
      ('CS','%senior%','Certified Customer Success Manager (CCSM)','preferred','Demo suggestion; confirm relevance with HR.'),
      ('PRD','%','Certified Scrum Product Owner (CSPO)','preferred','Demo suggestion; confirm relevance with HR.')
  ),
  proposed as (
    select jp.id as job_position_id,r.credential_name,r.criterion_type,r.notes
    from public.job_positions jp
    join public.departments d on d.id=jp.department_id
    join rules r on r.department_code=d.code and lower(jp.title) like r.title_pattern
  )
  insert into public.job_position_credential_criteria(
    job_position_id,credential_name,criterion_type,notes,created_by
  )
  select distinct p.job_position_id,p.credential_name,p.criterion_type,p.notes,author_id
  from proposed p
  on conflict (job_position_id,lower(btrim(credential_name))) do nothing;

  get diagnostics criteria_added=row_count;
  return jsonb_build_object(
    'positionCriteriaAdded',criteria_added,
    'employeeCredentialsAdded',0,
    'message','Only suggested position criteria were seeded. No employee credentials were created or marked verified.'
  );
end;
$$;

revoke all on function public.set_credential_criterion_creator() from public,anon,authenticated;
revoke all on function public.seed_demo_credentials() from public,anon,authenticated;
grant execute on function public.seed_demo_credentials() to service_role;

comment on function public.seed_demo_credentials() is
  'Adds idempotent demo suggestions for position criteria only; never creates or verifies employee-held credentials.';
