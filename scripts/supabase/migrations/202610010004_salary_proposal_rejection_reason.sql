alter table public.compensation_reviews
  add column if not exists rejection_reason text;

create or replace function public.require_compensation_rejection_reason()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='rejected'
    and old.status is distinct from new.status
    and nullif(btrim(new.rejection_reason),'') is null then
    raise exception 'A rejection reason is required' using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists require_compensation_rejection_reason
  on public.compensation_reviews;
create trigger require_compensation_rejection_reason
  before update of status on public.compensation_reviews
  for each row execute function public.require_compensation_rejection_reason();

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
    when 'compensation_reviews' then fields:='employee_id,cycle_id,current_salary,proposed_salary,bonus,effective_date,justification,status,rejection_reason'; roles:='super_admin,hr_admin,hr_manager,payroll_manager';
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
