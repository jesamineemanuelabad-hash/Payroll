-- Production workflow hardening: active-account enforcement, payroll approvals,
-- and automatic application of approved compensation changes.

create or replace function public.has_workspace_access()
returns boolean
language sql stable security definer
set search_path=''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.employment_status in ('active','on_leave')
  );
$$;
revoke all on function public.has_workspace_access() from public,anon;
grant execute on function public.has_workspace_access() to authenticated;

create or replace function public.has_any_role(required_roles public.app_role[])
returns boolean
language sql stable security definer
set search_path=''
as $$
  select public.has_workspace_access() and exists (
    select 1 from public.user_roles
    where user_id=auth.uid() and role=any(required_roles)
  );
$$;

create or replace function public.can_access_employee(target_employee_id uuid)
returns boolean
language sql stable security definer
set search_path=''
as $$
  select public.has_workspace_access() and (
    target_employee_id=auth.uid()
    or public.has_any_role(array['super_admin','hr_admin','payroll_manager','hr_manager']::public.app_role[])
    or exists (
      select 1 from public.profiles employee
      join public.manager_departments scope on scope.department_id=employee.department_id
      where employee.id=target_employee_id and scope.manager_id=auth.uid()
    )
  );
$$;

create or replace function public.record_roles()
returns text[] language sql stable security invoker set search_path='' as $$
  select case when public.has_workspace_access()
    then coalesce(array_agg(role::text order by role::text),array[]::text[])
    else array[]::text[] end
  from public.user_roles where user_id=auth.uid();
$$;

create or replace function public.workspace_session()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object(
      'userId',p.id,'email',p.email,'firstName',p.first_name,'lastName',p.last_name,
      'employmentStatus',p.employment_status,'isSystemOwner',p.is_system_owner,
      'active',p.employment_status in ('active','on_leave'),
      'roles',case when p.employment_status in ('active','on_leave') then coalesce((
        select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id=p.id
      ),'[]'::jsonb) else '[]'::jsonb end
    ) from public.profiles p where p.id=auth.uid()
  ),jsonb_build_object('active',false,'roles','[]'::jsonb));
$$;
revoke all on function public.workspace_session() from public,anon;
grant execute on function public.workspace_session() to authenticated;

-- The few policies that previously allowed every authenticated JWT are also
-- bound to an active workspace profile. Other policies already call the helpers above.
drop policy if exists "authenticated users read departments" on public.departments;
create policy "active users read departments" on public.departments for select to authenticated
using (public.has_workspace_access());
drop policy if exists "users read own roles" on public.user_roles;
create policy "active users read own roles" on public.user_roles for select to authenticated
using (public.has_workspace_access() and (user_id=auth.uid() or public.has_any_role(array['super_admin']::public.app_role[])));
drop policy if exists "managers read own scope" on public.manager_departments;
create policy "active managers read own scope" on public.manager_departments for select to authenticated
using (public.has_workspace_access() and (manager_id=auth.uid() or public.has_any_role(array['super_admin','hr_admin']::public.app_role[])));
drop policy if exists "authenticated users read active providers" on public.benefit_providers;
create policy "active users read providers" on public.benefit_providers for select to authenticated
using (public.has_workspace_access() and (status='active' or public.has_any_role(array['super_admin','hr_admin']::public.app_role[])));
drop policy if exists "authenticated users read active plans" on public.benefit_plans;
create policy "active users read plans" on public.benefit_plans for select to authenticated
using (public.has_workspace_access() and (status='active' or public.has_any_role(array['super_admin','hr_admin']::public.app_role[])));

-- Approved compensation reviews become effective on the day after the review
-- cycle. The current salary frequency and allowances are retained.
alter table public.employee_compensation_history
  add column if not exists source_review_id uuid unique references public.compensation_reviews(id) on delete restrict;

create or replace function public.apply_approved_compensation_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare effective_date date; current_record public.employee_compensation_history;
begin
  if new.status='approved' and old.status is distinct from 'approved' then
    select c.ends_on+1 into effective_date from public.compensation_cycles c where c.id=new.cycle_id;
    perform 1 from public.profiles where id=new.employee_id for update;
    select h.* into current_record from public.employee_compensation_history h
      where h.employee_id=new.employee_id and h.effective_from<effective_date
      order by h.effective_from desc limit 1 for update;
    if not found then raise exception 'Add a current salary record before approving this compensation change'; end if;
    if exists(select 1 from public.employee_compensation_history h where h.employee_id=new.employee_id and h.effective_from>=effective_date) then
      raise exception 'A salary record already exists on or after the proposed effective date';
    end if;
    if current_record.effective_to is null or current_record.effective_to>=effective_date then
      update public.employee_compensation_history set effective_to=effective_date-1 where id=current_record.id;
    end if;
    insert into public.employee_compensation_history(
      employee_id,base_salary,salary_frequency,allowances,effective_from,source,source_review_id
    ) values (
      new.employee_id,new.proposed_salary,current_record.salary_frequency,current_record.allowances,
      effective_date,'compensation_review',new.id
    );
    new.applied_at=now();
  end if;
  return new;
end $$;
drop trigger if exists apply_approved_compensation_review on public.compensation_reviews;
create trigger apply_approved_compensation_review
before update of status on public.compensation_reviews
for each row execute function public.apply_approved_compensation_review();

-- Employment status is an access-control operation, not a generic profile edit.
create or replace function public.record_definition(entity text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare fields text; roles text:='super_admin,hr_admin';
begin
  case entity
    when 'departments' then fields:='name,code';
    when 'profiles' then fields:='employee_number,first_name,last_name,email,department_id,job_title,location,hired_at';
    when 'attendance_records' then fields:='employee_id,external_id,attendance_date,time_in,time_out,worked_minutes,late_minutes,undertime_minutes,overtime_minutes,absence_minutes,classification,approved_leave'; roles:='super_admin,hr_admin,payroll_manager';
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
    else raise exception 'Unknown record type' using errcode='22023';
  end case;
  return jsonb_build_object('fields',to_jsonb(string_to_array(fields,',')),'roles',to_jsonb(string_to_array(roles,',')));
end $$;

create or replace function public.transition_payroll_run(p_run_id uuid,p_target public.payroll_status)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; saved jsonb;
begin
  if auth.uid() is null or not public.has_workspace_access() then
    raise exception 'Sign in with an active account' using errcode='42501';
  end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;

  if r.status='draft' and p_target='pending_approval' then
    if not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot submit payroll'; end if;
    if r.calculated_at is null or r.employee_count=0 then raise exception 'Calculate payroll before submitting it for approval'; end if;
    if exists(select 1 from public.payroll_items where payroll_run_id=r.id and status='needs_review') then raise exception 'Resolve all employee entries that need review before submission'; end if;
    if exists(select 1 from public.payroll_items where payroll_run_id=r.id and updated_at>r.calculated_at)
       or exists(select 1 from public.attendance_records a join public.payroll_items i on i.employee_id=a.employee_id and i.payroll_run_id=r.id where a.attendance_date between r.period_start and r.period_end and a.updated_at>r.calculated_at)
       or exists(select 1 from public.leave_requests l join public.payroll_items i on i.employee_id=l.employee_id and i.payroll_run_id=r.id where daterange(l.start_date,l.end_date,'[]')&&daterange(r.period_start,r.period_end,'[]') and l.updated_at>r.calculated_at)
       or exists(select 1 from public.employee_compensation_history h join public.payroll_items i on i.employee_id=h.employee_id and i.payroll_run_id=r.id where daterange(h.effective_from,h.effective_to,'[]')&&daterange(r.period_start,r.period_end,'[]') and h.updated_at>r.calculated_at)
       or exists(select 1 from public.employee_benefits b join public.payroll_items i on i.employee_id=b.employee_id and i.payroll_run_id=r.id where b.updated_at>r.calculated_at)
       or exists(select 1 from public.claims c join public.payroll_items i on i.employee_id=c.employee_id and i.payroll_run_id=r.id where c.updated_at>r.calculated_at) then
      raise exception 'Payroll inputs changed after calculation. Recalculate before submission';
    end if;
  elsif r.status='pending_approval' and p_target='approved' then
    if not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then raise exception 'An HR or super administrator must approve payroll'; end if;
  elsif r.status='pending_approval' and p_target='draft' then
    if not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot return payroll for revision'; end if;
  elsif r.status='approved' and p_target='paid' then
    if not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot mark payroll as paid'; end if;
  else
    raise exception 'Invalid payroll transition from % to %',r.status,p_target;
  end if;

  update public.payroll_runs set status=p_target,
    approved_by=case when p_target='approved' then auth.uid() when p_target='draft' then null else approved_by end,
    approved_at=case when p_target='approved' then now() when p_target='draft' then null else approved_at end,
    calculated_at=case when p_target='draft' then null else calculated_at end,
    rule_version=case when p_target='draft' then null else rule_version end,
    updated_at=clock_timestamp()
  where id=r.id returning to_jsonb(public.payroll_runs.*) into saved;
  return saved;
end $$;
revoke all on function public.transition_payroll_run(uuid,public.payroll_status) from public,anon;
grant execute on function public.transition_payroll_run(uuid,public.payroll_status) to authenticated;

create or replace function public.refresh_payroll_totals()
returns trigger language plpgsql security definer set search_path='' as $$
declare run_id uuid:=coalesce(new.payroll_run_id,old.payroll_run_id);
begin
  update public.payroll_runs set employee_count=x.n,total_gross=x.gross,total_deductions=x.deductions,
    total_contributions=x.contributions,total_net=x.net,calculated_at=null,rule_version=null
  from (select count(*)::integer n,coalesce(sum(gross_pay),0) gross,coalesce(sum(deductions),0) deductions,
    coalesce(sum(contributions),0) contributions,coalesce(sum(net_pay),0) net
    from public.payroll_items where payroll_run_id=run_id and status<>'excluded') x where id=run_id;
  return coalesce(new,old);
end $$;

-- Wrap the statutory calculation so approved review bonuses are included once,
-- while preserving any authorized manual bonus through repeated recalculations.
create or replace function public.calculate_payroll_run_complete(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; result jsonb; manual_bonuses jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then
    raise exception 'Your role cannot calculate payroll' using errcode='42501';
  end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  select coalesce(jsonb_object_agg(i.employee_id::text,greatest(0,i.bonus-coalesce((i.calculation_snapshot->>'compensationBonus')::numeric,0))),'{}'::jsonb)
    into manual_bonuses from public.payroll_items i where i.payroll_run_id=p_run_id;

  result:=public.calculate_payroll_run(p_run_id);

  with review_bonus as (
    select i.id,i.employee_id,
      coalesce((manual_bonuses->>i.employee_id::text)::numeric,0) manual_bonus,
      coalesce(sum(cr.bonus) filter(where cr.id is not null),0) compensation_bonus
    from public.payroll_items i
    left join public.compensation_reviews cr on cr.employee_id=i.employee_id and cr.status='approved' and cr.applied_at is not null
      and (cr.applied_payroll_run_id is null or cr.applied_payroll_run_id=p_run_id)
      and exists(select 1 from public.compensation_cycles cc where cc.id=cr.cycle_id and cc.ends_on<r.period_end)
    where i.payroll_run_id=p_run_id group by i.id,i.employee_id
  ), amounts as (
    select i.id,b.manual_bonus+b.compensation_bonus new_bonus,b.compensation_bonus,
      greatest(0,i.basic_salary+i.allowances+i.overtime+b.manual_bonus+b.compensation_bonus-i.sss_employee-i.philhealth_employee) taxable
    from public.payroll_items i join review_bonus b on b.id=i.id
  )
  update public.payroll_items i set bonus=a.new_bonus,taxable_compensation=round(a.taxable,2),
    withholding_tax=public.bir_withholding_tax(a.taxable,r.schedule),
    calculation_snapshot=i.calculation_snapshot||jsonb_build_object('compensationBonus',a.compensation_bonus)
  from amounts a where i.id=a.id;

  update public.compensation_reviews cr set applied_payroll_run_id=p_run_id
  where cr.status='approved' and cr.applied_at is not null and cr.bonus>0 and cr.applied_payroll_run_id is null
    and exists(select 1 from public.payroll_items i where i.payroll_run_id=p_run_id and i.employee_id=cr.employee_id)
    and exists(select 1 from public.compensation_cycles cc where cc.id=cr.cycle_id and cc.ends_on<r.period_end);
  update public.payroll_runs set calculated_at=now(),rule_version='PH-2025/BIR-2023-v1' where id=p_run_id;
  return result;
end $$;
revoke all on function public.calculate_payroll_run_complete(uuid) from public,anon;
grant execute on function public.calculate_payroll_run_complete(uuid) to authenticated;
revoke execute on function public.calculate_payroll_run(uuid) from authenticated;

comment on function public.transition_payroll_run(uuid,public.payroll_status) is 'Enforces draft, approval, and paid payroll state transitions with role separation.';
comment on function public.calculate_payroll_run_complete(uuid) is 'Calculates payroll and idempotently consumes approved compensation bonuses.';
