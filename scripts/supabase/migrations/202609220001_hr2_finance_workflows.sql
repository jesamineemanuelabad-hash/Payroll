-- HR2-owned employee master data, staged finance workflows, and complete claim details.

-- Text status columns allow explicit business stages without rewriting historical enum types.
drop trigger if exists apply_approved_compensation_review on public.compensation_reviews;
drop policy if exists "employees create own draft claims" on public.claims;
drop policy if exists "employees edit own draft claims" on public.claims;
alter table public.claims drop constraint if exists claims_rejection_reason_required;
alter table public.compensation_reviews alter column status drop default;
alter table public.compensation_reviews alter column status type text using status::text;
update public.compensation_reviews set status='pending' where status='submitted';
alter table public.compensation_reviews alter column status set default 'draft';
alter table public.compensation_reviews add constraint compensation_reviews_status_valid
  check (status in ('draft','pending','hr_review','finance_review','approved','implemented','rejected'));

alter table public.claims alter column status drop default;
alter table public.claims alter column status type text using status::text;
update public.claims set status='pending' where status='submitted';
alter table public.claims alter column status set default 'draft';
alter table public.claims add constraint claims_status_valid
  check (status in ('draft','pending','under_review','finance_approval','approved','rejected','paid'));
alter table public.claims add constraint claims_rejection_reason_required
  check (status<>'rejected' or nullif(btrim(rejection_reason),'') is not null);

alter table public.compensation_reviews
  add column if not exists effective_date date,
  add column if not exists adjustment_amount numeric(12,2) not null default 0,
  add column if not exists within_budget boolean not null default true,
  add column if not exists budget_remaining_after numeric(14,2) not null default 0,
  add column if not exists hr_reviewer_id uuid references public.profiles(id) on delete restrict,
  add column if not exists hr_reviewed_at timestamptz,
  add column if not exists finance_reviewer_id uuid references public.profiles(id) on delete restrict,
  add column if not exists finance_reviewed_at timestamptz;

update public.compensation_reviews r
set effective_date=c.ends_on+1
from public.compensation_cycles c
where c.id=r.cycle_id and r.effective_date is null;
alter table public.compensation_reviews alter column effective_date set not null;

alter table public.claims
  add column if not exists expense_date date,
  add column if not exists requested_amount numeric(12,2),
  add column if not exists approved_amount numeric(12,2) not null default 0,
  add column if not exists reviewer_id uuid references public.profiles(id) on delete restrict,
  add column if not exists reviewed_at timestamptz,
  add column if not exists finance_approver_id uuid references public.profiles(id) on delete restrict,
  add column if not exists finance_approved_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at timestamptz;

update public.claims
set expense_date=coalesce(expense_date,created_at::date),
    requested_amount=coalesce(requested_amount,amount),
    approved_amount=case when status in ('approved','paid') and approved_amount=0 then amount else approved_amount end;
alter table public.claims alter column expense_date set not null;
alter table public.claims alter column requested_amount set not null;
alter table public.claims add constraint claims_requested_amount_positive check (requested_amount>0);
alter table public.claims add constraint claims_approved_amount_valid check (approved_amount>=0 and approved_amount<=requested_amount);

create index if not exists compensation_reviews_status_effective_idx on public.compensation_reviews(status,effective_date);
create index if not exists claims_status_expense_idx on public.claims(status,expense_date desc);

create or replace function public.prepare_compensation_review()
returns trigger language plpgsql set search_path='' as $$
declare cycle_budget numeric; committed numeric;
begin
  select budget into cycle_budget from public.compensation_cycles where id=new.cycle_id;
  if cycle_budget is null then raise exception 'Compensation cycle not found'; end if;
  new.adjustment_amount:=round(new.proposed_salary-new.current_salary,2);
  select coalesce(sum(greatest(0,adjustment_amount)+bonus),0) into committed
  from public.compensation_reviews
  where cycle_id=new.cycle_id and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
    and status not in ('draft','rejected');
  new.budget_remaining_after:=round(cycle_budget-committed-greatest(0,new.adjustment_amount)-new.bonus,2);
  new.within_budget:=new.budget_remaining_after>=0;
  return new;
end $$;
drop trigger if exists prepare_compensation_review on public.compensation_reviews;
create trigger prepare_compensation_review before insert or update of cycle_id,current_salary,proposed_salary,bonus,status
on public.compensation_reviews for each row execute function public.prepare_compensation_review();

-- A proposal changes salary history only after Finance approval has been explicitly implemented.
create or replace function public.apply_approved_compensation_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare current_record public.employee_compensation_history;
begin
  if new.status='implemented' and old.status is distinct from 'implemented' then
    if old.status<>'approved' then raise exception 'Finance approval is required before implementation'; end if;
    perform 1 from public.profiles where id=new.employee_id for update;
    select h.* into current_record from public.employee_compensation_history h
      where h.employee_id=new.employee_id and h.effective_from<new.effective_date
      order by h.effective_from desc limit 1 for update;
    if not found then raise exception 'Add a current salary record before implementing this compensation change'; end if;
    if exists(select 1 from public.employee_compensation_history h where h.employee_id=new.employee_id and h.effective_from>=new.effective_date) then
      raise exception 'A salary record already exists on or after the proposed effective date';
    end if;
    if current_record.effective_to is null or current_record.effective_to>=new.effective_date then
      update public.employee_compensation_history set effective_to=new.effective_date-1 where id=current_record.id;
    end if;
    insert into public.employee_compensation_history(
      employee_id,base_salary,salary_frequency,allowances,effective_from,source,source_review_id
    ) values (
      new.employee_id,new.proposed_salary,current_record.salary_frequency,current_record.allowances,
      new.effective_date,'compensation_review',new.id
    );
    new.applied_at=now();
  end if;
  return new;
end $$;
create trigger apply_approved_compensation_review
before update of status on public.compensation_reviews
for each row execute function public.apply_approved_compensation_review();

create policy "employees create own draft claims" on public.claims for insert to authenticated
with check (employee_id=auth.uid() and status='draft' and approver_id is null and verification_status='pending');
create policy "employees edit own draft claims" on public.claims for update to authenticated
using (employee_id=auth.uid() and status='draft')
with check (employee_id=auth.uid() and status in ('draft','pending') and approver_id is null and verification_status='pending');

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
    else raise exception 'Unknown record type' using errcode='22023';
  end case;
  return jsonb_build_object('fields',to_jsonb(string_to_array(fields,',')),'roles',to_jsonb(string_to_array(roles,',')));
end $$;

create or replace function public.mutate_record(p_entity text,p_operation text,p_data jsonb default '{}'::jsonb,p_id uuid default null,p_version timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  definition jsonb; allowed text[]; required_roles public.app_role[]; key text; columns_sql text; values_sql text; assignments_sql text;
  previous jsonb; next_row jsonb; saved jsonb; target_id uuid; parent_id uuid; parent_status public.payroll_status;
  old_status text; new_status text;
begin
  if auth.uid() is null then raise exception 'Sign in to change records' using errcode='42501'; end if;
  definition:=public.record_definition(p_entity);
  select array_agg(value::public.app_role) into required_roles from jsonb_array_elements_text(definition->'roles');
  if not public.has_any_role(required_roles) then raise exception 'Your role cannot change these records' using errcode='42501'; end if;
  if p_operation not in ('create','update','delete') or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid operation'; end if;
  if p_entity='profiles' and p_operation='create' then raise exception 'Employees must be synchronized from HR2; manual employee creation is disabled'; end if;
  select array_agg(value) into allowed from jsonb_array_elements_text(definition->'fields');
  for key in select jsonb_object_keys(p_data) loop if not key=any(allowed) then raise exception 'Field % cannot be changed',key; end if; end loop;

  if p_operation<>'create' then
    if p_id is null or p_version is null then raise exception 'Record ID and version are required'; end if;
    if p_entity='payroll_items' then select payroll_run_id into parent_id from public.payroll_items where id=p_id; perform 1 from public.payroll_runs where id=parent_id for update; end if;
    execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_entity) into previous using p_id;
    if previous is null then raise exception 'Record no longer exists' using errcode='P0002'; end if;
    if (previous->>'updated_at')::timestamptz<>p_version then raise exception 'This record changed. Refresh and review the latest version before saving.' using errcode='40001'; end if;
    if p_entity='payroll_runs' and previous->>'status'<>'draft' then raise exception 'Only draft runs can be edited or deleted'; end if;
    if p_entity='claims' and (previous->>'status' in ('rejected','paid') or previous->>'included_payroll_run_id' is not null) then raise exception 'Rejected, paid, or payroll-linked claims are read-only'; end if;
    if p_entity='compensation_reviews' and (previous->>'status' in ('implemented','rejected') or previous->>'applied_at' is not null) then raise exception 'Implemented or rejected compensation proposals are read-only'; end if;
    if p_entity='employee_benefits' and previous->>'applied_payroll_run_id' is not null then raise exception 'Payroll-linked benefits are read-only'; end if;
    if p_entity='profiles' and p_id=auth.uid() and (p_operation='delete' or p_data->>'employment_status'='terminated') then raise exception 'You cannot delete or terminate your own profile'; end if;
  end if;
  if p_operation='delete' then
    if p_entity='compensation_cycles' and exists(select 1 from public.compensation_reviews where cycle_id=p_id) then raise exception 'Remove draft proposals before deleting a cycle. Cycles with retained reviews cannot be deleted.'; end if;
    if p_entity in ('claims','compensation_reviews') and previous->>'status'<>'draft' then raise exception 'Only drafts can be deleted'; end if;
    if p_entity='payroll_runs' and exists(select 1 from public.payroll_items where payroll_run_id=p_id) then raise exception 'Delete the draft employee entries before deleting the run'; end if;
    execute format('delete from public.%I where id=$1 returning to_jsonb(%I.*)',p_entity,p_entity) into saved using p_id; return saved;
  end if;

  next_row:=coalesce(previous,'{}'::jsonb)||p_data;
  if p_entity in ('claims','compensation_reviews') then
    old_status:=previous->>'status'; new_status:=next_row->>'status';
    if p_operation='create' and new_status<>'draft' then raise exception 'New records must start as draft'; end if;
    if p_operation='update' and old_status<>'draft' and new_status=old_status then raise exception 'Use the next workflow status; submitted details are read-only'; end if;
    if p_operation='update' and old_status<>'draft' and next_row->>'employee_id' is distinct from previous->>'employee_id' then raise exception 'Cannot reassign a submitted record'; end if;
    if p_entity='compensation_reviews' then
      if new_status not in ('draft','pending','hr_review','finance_review','approved','implemented','rejected') then raise exception 'Invalid compensation status'; end if;
      if p_operation='update' and new_status<>old_status and not (
        (old_status='draft' and new_status='pending') or (old_status='pending' and new_status='hr_review') or
        (old_status='hr_review' and new_status in ('finance_review','rejected')) or
        (old_status='finance_review' and new_status in ('approved','rejected')) or
        (old_status='approved' and new_status='implemented')) then raise exception 'Invalid compensation transition from % to %',old_status,new_status; end if;
      if new_status in ('pending','hr_review','finance_review') and new_status is distinct from old_status and not public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) then raise exception 'HR review permission is required'; end if;
      if new_status in ('approved','implemented') and new_status is distinct from old_status and not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Finance review permission is required'; end if;
      if new_status='approved' and not coalesce((previous->>'within_budget')::boolean,false) then raise exception 'The proposal exceeds the compensation cycle budget'; end if;
      if new_status in ('approved','rejected') and (next_row->>'employee_id')::uuid=auth.uid() then raise exception 'You cannot decide your own compensation proposal'; end if;
      p_data:=p_data||jsonb_build_object('increase_percentage',case when (next_row->>'current_salary')::numeric=0 then 0 else round(((next_row->>'proposed_salary')::numeric/(next_row->>'current_salary')::numeric-1)*100,3) end);
      if new_status='pending' and old_status is distinct from 'pending' then p_data:=p_data||jsonb_build_object('submitted_by',auth.uid()); end if;
      if new_status='hr_review' and old_status is distinct from 'hr_review' then p_data:=p_data||jsonb_build_object('hr_reviewer_id',auth.uid(),'hr_reviewed_at',now()); end if;
      if new_status='finance_review' and old_status is distinct from 'finance_review' then p_data:=p_data||jsonb_build_object('finance_reviewer_id',auth.uid(),'finance_reviewed_at',now()); end if;
      if new_status='approved' and old_status is distinct from 'approved' then p_data:=p_data||jsonb_build_object('approved_by',auth.uid()); end if;
    else
      if new_status not in ('draft','pending','under_review','finance_approval','approved','rejected','paid') then raise exception 'Invalid claim status'; end if;
      if p_operation='update' and new_status<>old_status and not (
        (old_status='draft' and new_status='pending') or (old_status='pending' and new_status in ('under_review','rejected')) or
        (old_status='under_review' and new_status in ('finance_approval','rejected')) or
        (old_status='finance_approval' and new_status in ('approved','rejected')) or
        (old_status='approved' and new_status='paid')) then raise exception 'Invalid claim transition from % to %',old_status,new_status; end if;
      if new_status in ('pending','under_review','finance_approval') and new_status is distinct from old_status and not public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]) then raise exception 'HR claim review permission is required'; end if;
      if new_status in ('approved','paid') and new_status is distinct from old_status and not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Finance approval permission is required'; end if;
      if next_row->>'receipt_url' is not null and next_row->>'receipt_url'!~'^https://' then raise exception 'Document URL must use HTTPS'; end if;
      if new_status in ('finance_approval','approved') and (next_row->>'verification_status'<>'verified' or nullif(next_row->>'receipt_url','') is null) then raise exception 'Verify the supporting document before Finance approval'; end if;
      if new_status='approved' and (next_row->>'approved_amount')::numeric<=0 then raise exception 'Enter an approved amount before approval'; end if;
      if (next_row->>'approved_amount')::numeric>(next_row->>'requested_amount')::numeric then raise exception 'Approved amount cannot exceed requested amount'; end if;
      if new_status='rejected' and nullif(btrim(next_row->>'rejection_reason'),'') is null then raise exception 'A rejection reason is required'; end if;
      if new_status in ('approved','rejected') and (next_row->>'employee_id')::uuid=auth.uid() then raise exception 'You cannot decide your own claim'; end if;
      if next_row->>'verification_status'='verified' and (next_row->>'employee_id')::uuid=auth.uid() then raise exception 'A different reviewer must verify your claim'; end if;
      if next_row->>'verification_status'='verified' and (previous->>'verification_status' is distinct from 'verified' or previous->>'receipt_url' is distinct from next_row->>'receipt_url') then p_data:=p_data||jsonb_build_object('verified_by',auth.uid(),'verified_at',now()); end if;
      if next_row->>'verification_status'<>'verified' then p_data:=p_data||jsonb_build_object('verified_by',null,'verified_at',null); end if;
      if new_status='pending' and old_status is distinct from 'pending' then p_data:=p_data||jsonb_build_object('submitted_at',now()); end if;
      if new_status='under_review' and old_status is distinct from 'under_review' then p_data:=p_data||jsonb_build_object('reviewer_id',auth.uid(),'reviewed_at',now()); end if;
      if new_status='finance_approval' and old_status is distinct from 'finance_approval' then p_data:=p_data||jsonb_build_object('finance_approver_id',auth.uid(),'finance_approved_at',now()); end if;
      if new_status='approved' and old_status is distinct from 'approved' then p_data:=p_data||jsonb_build_object('approver_id',auth.uid(),'approved_at',now(),'amount',(next_row->>'approved_amount')::numeric); end if;
      if new_status='paid' and old_status is distinct from 'paid' then p_data:=p_data||jsonb_build_object('paid_at',now()); end if;
      if p_operation='create' then p_data:=p_data||jsonb_build_object('amount',(next_row->>'requested_amount')::numeric); end if;
    end if;
  end if;
  if p_entity='employee_benefits' and next_row->>'status'='active' and next_row->>'eligibility'<>'eligible' then raise exception 'Review eligibility before activating coverage'; end if;
  if p_entity='employee_compensation_history' then
    perform 1 from public.profiles where id=(next_row->>'employee_id')::uuid for update;
    if exists(select 1 from public.employee_compensation_history where employee_id=(next_row->>'employee_id')::uuid and id<>coalesce(p_id,'00000000-0000-0000-0000-000000000000'::uuid) and daterange(effective_from,effective_to,'[]')&&daterange((next_row->>'effective_from')::date,(next_row->>'effective_to')::date,'[]')) then raise exception 'Salary effective dates overlap an existing record'; end if;
    if p_operation='create' then p_data:=p_data||'{"source":"manual"}'::jsonb; end if;
  end if;
  if p_entity='payroll_items' then parent_id:=(next_row->>'payroll_run_id')::uuid; select status into parent_status from public.payroll_runs where id=parent_id for update; if parent_status is distinct from 'draft'::public.payroll_status then raise exception 'Only draft payroll entries can be changed'; end if; end if;
  if p_operation='create' then
    if p_entity in ('payroll_runs','compensation_cycles') then p_data:=p_data||jsonb_build_object('created_by',auth.uid()); end if;
    if p_entity='payroll_runs' then p_data:=p_data||'{"status":"draft"}'::jsonb; end if;
    target_id:=gen_random_uuid(); p_data:=p_data||jsonb_build_object('id',target_id);
    select string_agg(format('%I',k),',') into columns_sql from jsonb_object_keys(p_data) k;
    select string_agg(format('r.%I',k),',') into values_sql from jsonb_object_keys(p_data) k;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',p_entity,columns_sql,values_sql,p_entity,p_entity) into saved using p_data;
  else
    p_data:=p_data||jsonb_build_object('updated_at',clock_timestamp());
    select string_agg(format('%I=r.%I',k,k),',') into assignments_sql from jsonb_object_keys(p_data) k;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t.*)',p_entity,assignments_sql,p_entity) into saved using p_data,p_id;
  end if;
  return saved;
end $$;
revoke all on function public.mutate_record(text,text,jsonb,uuid,timestamptz) from public,anon;
grant execute on function public.mutate_record(text,text,jsonb,uuid,timestamptz) to authenticated;

comment on function public.mutate_record(text,text,jsonb,uuid,timestamptz) is 'Enforces HR2-owned profiles plus staged HR/Finance compensation and reimbursement workflows.';

-- Implemented compensation bonuses are included once in the first eligible payroll.
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
    from public.payroll_items i left join public.compensation_reviews cr on cr.employee_id=i.employee_id and cr.status='implemented' and cr.applied_at is not null
      and cr.effective_date<=r.period_end and (cr.applied_payroll_run_id is null or cr.applied_payroll_run_id=p_run_id)
    where i.payroll_run_id=p_run_id group by i.id,i.employee_id
  ), amounts as (
    select i.id,b.manual_bonus+b.compensation_bonus new_bonus,b.compensation_bonus,
      greatest(0,i.basic_salary+i.allowances+i.overtime+i.night_differential+b.manual_bonus+b.compensation_bonus-i.sss_employee-i.philhealth_employee-i.pagibig_employee) taxable
    from public.payroll_items i join review_bonus b on b.id=i.id
  )
  update public.payroll_items i set bonus=a.new_bonus,taxable_compensation=round(a.taxable,2),withholding_tax=public.bir_withholding_tax(a.taxable,r.schedule),
    calculation_snapshot=i.calculation_snapshot||jsonb_build_object('compensationBonus',a.compensation_bonus)
  from amounts a where i.id=a.id;
  update public.compensation_reviews cr set applied_payroll_run_id=p_run_id where cr.status='implemented' and cr.applied_at is not null and cr.bonus>0
    and cr.applied_payroll_run_id is null and cr.effective_date<=r.period_end
    and exists(select 1 from public.payroll_items i where i.payroll_run_id=p_run_id and i.employee_id=cr.employee_id);
  update public.payroll_runs set calculated_at=now(),rule_version=policy_version,validation_status='not_run',validated_at=null where id=p_run_id;
  validation:=public.validate_payroll_run(p_run_id);
  return jsonb_build_object('runId',p_run_id,'employees',(select employee_count from public.payroll_runs where id=p_run_id),'ruleVersion',policy_version,'validation',validation);
end $$;
revoke all on function public.calculate_payroll_run_complete(uuid) from public,anon;
grant execute on function public.calculate_payroll_run_complete(uuid) to authenticated;
