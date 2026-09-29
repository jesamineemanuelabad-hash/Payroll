-- Auditable Philippine payroll calculation, paid leave, cutoff schedules, and payslips.

alter table public.payroll_runs drop constraint if exists payroll_runs_pay_date_valid;
alter table public.payroll_runs add constraint payroll_runs_pay_date_valid check (pay_date >= period_end);
alter table public.payroll_runs
  add column if not exists schedule text,
  add column if not exists preparation_date date,
  add column if not exists calculated_at timestamptz,
  add column if not exists rule_version text;

update public.payroll_runs
set schedule = case
  when extract(day from period_start) = 1 and extract(day from period_end) = 15 then 'first_cutoff'
  when period_end = (date_trunc('month', period_end) + interval '1 month - 1 day')::date
       and extract(day from period_start) = 16 then 'second_cutoff'
  else 'monthly'
end,
preparation_date = pay_date - 2
where schedule is null or preparation_date is null;

alter table public.payroll_runs alter column schedule set not null;
alter table public.payroll_runs alter column preparation_date set not null;
alter table public.payroll_runs add constraint payroll_runs_schedule_valid check (schedule in ('first_cutoff','second_cutoff','monthly'));
alter table public.payroll_runs add constraint payroll_runs_preparation_valid check (preparation_date <= pay_date);

alter table public.payroll_items
  add column if not exists salary_frequency text not null default 'monthly',
  add column if not exists daily_rate numeric(12,4) not null default 0,
  add column if not exists hourly_rate numeric(12,4) not null default 0,
  add column if not exists worked_days numeric(8,3) not null default 0,
  add column if not exists paid_leave_days numeric(8,3) not null default 0,
  add column if not exists late_minutes integer not null default 0,
  add column if not exists undertime_minutes integer not null default 0,
  add column if not exists absence_minutes integer not null default 0,
  add column if not exists overtime_minutes integer not null default 0,
  add column if not exists bonus numeric(12,2) not null default 0,
  add column if not exists late_deduction numeric(12,2) not null default 0,
  add column if not exists undertime_deduction numeric(12,2) not null default 0,
  add column if not exists absence_deduction numeric(12,2) not null default 0,
  add column if not exists sss_employee numeric(12,2) not null default 0,
  add column if not exists philhealth_employee numeric(12,2) not null default 0,
  add column if not exists withholding_tax numeric(12,2) not null default 0,
  add column if not exists other_deductions numeric(12,2) not null default 0,
  add column if not exists sss_employer numeric(12,2) not null default 0,
  add column if not exists philhealth_employer numeric(12,2) not null default 0,
  add column if not exists benefit_employee_deduction numeric(12,2) not null default 0,
  add column if not exists benefit_employer_contribution numeric(12,2) not null default 0,
  add column if not exists taxable_compensation numeric(12,2) not null default 0;

alter table public.payroll_items add constraint payroll_items_salary_frequency_valid check (salary_frequency in ('monthly','semi_monthly','daily','hourly'));
alter table public.payroll_items add constraint payroll_items_minutes_nonnegative check (late_minutes >= 0 and undertime_minutes >= 0 and absence_minutes >= 0 and overtime_minutes >= 0);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  leave_type text not null check (leave_type in ('vacation','sick','emergency','maternity','paternity','service_incentive','other')),
  start_date date not null,
  end_date date not null,
  total_days numeric(7,3) not null check (total_days > 0),
  is_paid boolean not null default true,
  reason text not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled')),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_dates_valid check (end_date >= start_date),
  constraint leave_rejection_reason_required check (status <> 'rejected' or nullif(btrim(rejection_reason),'') is not null)
);
create index leave_requests_employee_dates_idx on public.leave_requests(employee_id,start_date,end_date,status);
create trigger set_leave_requests_updated_at before update on public.leave_requests for each row execute function public.set_updated_at();
create trigger audit_record after insert or update or delete on public.leave_requests for each row execute function public.audit_record_change();
create trigger require_payroll_employee before insert or update of employee_id on public.leave_requests for each row execute function public.require_payroll_employee();

alter table public.leave_requests enable row level security;
create policy "users read permitted leave" on public.leave_requests for select to authenticated using (public.can_access_employee(employee_id));
create policy "employees create own leave" on public.leave_requests for insert to authenticated with check (employee_id=auth.uid() and status='draft');
create policy "employees edit own draft leave" on public.leave_requests for update to authenticated using (employee_id=auth.uid() and status='draft') with check (employee_id=auth.uid() and status in ('draft','submitted'));
create policy "hr roles manage leave" on public.leave_requests for all to authenticated using (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[])) with check (public.has_any_role(array['super_admin','hr_admin','hr_manager']::public.app_role[]));
revoke insert,update,delete on public.leave_requests from authenticated,anon;

create or replace function public.guard_leave_request()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if old.status in ('approved','rejected') then raise exception 'Decided leave requests are read-only'; end if;
    return old;
  end if;
  if tg_op='INSERT' and new.status <> 'draft' then raise exception 'New leave requests must start as draft'; end if;
  if tg_op='UPDATE' then
    if old.status in ('approved','rejected','cancelled') then raise exception 'Decided leave requests are read-only'; end if;
    if new.status in ('approved','rejected') and old.status <> 'submitted' then raise exception 'Submit the leave request before a decision'; end if;
    if new.status in ('approved','rejected') and new.employee_id=auth.uid() then raise exception 'You cannot decide your own leave request'; end if;
    if new.status='approved' then new.approved_by:=auth.uid(); new.approved_at:=now(); end if;
  end if;
  return new;
end $$;
create trigger guard_leave_request before insert or update or delete on public.leave_requests for each row execute function public.guard_leave_request();

create or replace function public.payroll_schedule_for(p_start date,p_end date)
returns text language plpgsql immutable set search_path='' as $$
begin
  if extract(day from p_start)=1 and extract(day from p_end)=15 and date_trunc('month',p_start)=date_trunc('month',p_end) then return 'first_cutoff'; end if;
  if extract(day from p_start)=16 and p_end=(date_trunc('month',p_end)+interval '1 month - 1 day')::date and date_trunc('month',p_start)=date_trunc('month',p_end) then return 'second_cutoff'; end if;
  if extract(day from p_start)=1 and p_end=(date_trunc('month',p_end)+interval '1 month - 1 day')::date and date_trunc('month',p_start)=date_trunc('month',p_end) then return 'monthly'; end if;
  raise exception 'Payroll period must be the 1st-15th, 16th-month end, or a complete calendar month';
end $$;

create or replace function public.prepare_payroll_run()
returns trigger language plpgsql set search_path='' as $$
begin
  new.schedule:=public.payroll_schedule_for(new.period_start,new.period_end);
  new.preparation_date:=new.pay_date-2;
  return new;
end $$;
create trigger prepare_payroll_run before insert or update of period_start,period_end,pay_date on public.payroll_runs for each row execute function public.prepare_payroll_run();

-- 2025 SSS employee schedule: 5% of monthly salary credit, rounded to the nearest PHP 500,
-- bounded by PHP 5,000 and PHP 35,000. Employer share is 10%, plus EC.
create or replace function public.sss_monthly_contribution(p_monthly_salary numeric)
returns jsonb language sql immutable set search_path='' as $$
  with v as (select greatest(5000::numeric,least(35000::numeric,floor((greatest(p_monthly_salary,0)+250)/500)*500)) msc)
  select jsonb_build_object('msc',msc,'employee',round(msc*.05,2),'employer',round(msc*.10 + case when msc<15000 then 10 else 30 end,2)) from v
$$;

create or replace function public.philhealth_monthly_contribution(p_monthly_basic numeric)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('premium',round(greatest(10000::numeric,least(100000::numeric,greatest(p_monthly_basic,0)))*.05,2),
    'employee',round(greatest(10000::numeric,least(100000::numeric,greatest(p_monthly_basic,0)))*.025,2),
    'employer',round(greatest(10000::numeric,least(100000::numeric,greatest(p_monthly_basic,0)))*.025,2))
$$;

-- BIR Annex E, effective January 1, 2023 onward.
create or replace function public.bir_withholding_tax(p_taxable numeric,p_schedule text)
returns numeric language plpgsql immutable set search_path='' as $$
declare x numeric:=greatest(coalesce(p_taxable,0),0);
begin
  if p_schedule in ('first_cutoff','second_cutoff') then
    return round(case when x<=10417 then 0 when x<=16666 then (x-10417)*.15 when x<=33332 then 937.50+(x-16667)*.20
      when x<=83332 then 4270.70+(x-33333)*.25 when x<=333332 then 16770.70+(x-83333)*.30 else 91770.70+(x-333333)*.35 end,2);
  end if;
  return round(case when x<=20833 then 0 when x<=33332 then (x-20833)*.15 when x<=66666 then 1875+(x-33333)*.20
    when x<=166666 then 8541.80+(x-66667)*.25 when x<=666666 then 33541.80+(x-166667)*.30 else 183541.80+(x-666667)*.35 end,2);
end $$;

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
    new.other_deductions:=greatest(0,new.deductions-new.late_deduction-new.undertime_deduction-new.absence_deduction-new.sss_employee-new.philhealth_employee-new.withholding_tax-new.benefit_employee_deduction);
  end if;
  itemized:=new.late_deduction+new.undertime_deduction+new.absence_deduction+new.sss_employee+new.philhealth_employee+new.withholding_tax+new.benefit_employee_deduction+new.other_deductions;
  new.deductions:=round(itemized,2);
  new.contributions:=round(new.sss_employer+new.philhealth_employer+new.benefit_employer_contribution,2);
  new.gross_pay:=round(new.basic_salary+new.allowances+new.overtime+new.bonus+new.attendance_adjustments+new.benefits+new.reimbursements,2);
  new.net_pay:=round(new.gross_pay-new.deductions,2);
  if new.net_pay<0 then raise exception 'Deductions exceed gross earnings'; end if;
  return new;
end $$;

create or replace function public.calculate_payroll_run(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.payroll_runs; n integer; contribution_factor numeric;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then raise exception 'Your role cannot calculate payroll' using errcode='42501'; end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if r.status<>'draft' then raise exception 'Only draft payroll runs can be calculated'; end if;
  contribution_factor:=case when r.schedule='monthly' then 1 else .5 end;

  with eligible as (
    select p.id employee_id,c.base_salary,c.salary_frequency,
      coalesce((select sum(value::numeric) from jsonb_each_text(c.allowances) where value ~ '^[0-9]+(\.[0-9]+)?$'),0) monthly_allowances
    from public.profiles p join lateral (
      select h.* from public.employee_compensation_history h where h.employee_id=p.id and h.effective_from<=r.period_end and (h.effective_to is null or h.effective_to>=r.period_start) order by h.effective_from desc limit 1
    ) c on true
    where p.is_payroll_employee and not p.is_system_owner and p.employment_status in ('active','on_leave') and (p.hired_at is null or p.hired_at<=r.period_end)
  ), rates as (
    select e.*,case e.salary_frequency when 'monthly' then e.base_salary when 'semi_monthly' then e.base_salary*2 when 'daily' then e.base_salary*22 else e.base_salary*176 end monthly_basic,
      case e.salary_frequency when 'monthly' then e.base_salary/22 when 'semi_monthly' then e.base_salary*2/22 when 'daily' then e.base_salary else e.base_salary*8 end daily_rate,
      case e.salary_frequency when 'monthly' then e.base_salary/176 when 'semi_monthly' then e.base_salary*2/176 when 'daily' then e.base_salary/8 else e.base_salary end hourly_rate
    from eligible e
  ), attendance as (
    select q.employee_id,coalesce(sum(a.worked_minutes),0) worked_minutes,coalesce(sum(a.late_minutes),0)::integer late_minutes,
      coalesce(sum(a.undertime_minutes),0)::integer undertime_minutes,coalesce(sum(a.overtime_minutes),0)::integer overtime_minutes,
      coalesce(sum(case when a.classification='absent' and not a.approved_leave and not exists(
        select 1 from public.leave_requests l where l.employee_id=a.employee_id and l.status='approved' and l.is_paid and a.attendance_date between l.start_date and l.end_date
      ) then greatest(a.absence_minutes,480) else 0 end),0)::integer absence_minutes,
      count(*) filter(where a.classification not in ('absent','on_leave'))::numeric worked_days
    from rates q left join public.attendance_records a on a.employee_id=q.employee_id and a.attendance_date between r.period_start and r.period_end group by q.employee_id
  ), leaves as (
    select q.employee_id,coalesce((select sum(least(l.total_days,(
        select count(*) from generate_series(greatest(l.start_date,r.period_start),least(l.end_date,r.period_end),interval '1 day') day
        where extract(isodow from day) between 1 and 5
      ))) from public.leave_requests l
      where l.employee_id=q.employee_id and l.status='approved' and l.is_paid
        and daterange(l.start_date,l.end_date,'[]')&&daterange(r.period_start,r.period_end,'[]')),0)::numeric paid_leave_days
    from rates q
  ), plan_costs as (
    select q.employee_id,coalesce(sum(bp.employee_cost),0)*contribution_factor employee_cost,coalesce(sum(bp.employer_cost),0)*contribution_factor employer_cost
    from rates q left join public.employee_benefits eb on eb.employee_id=q.employee_id and eb.status='active' and eb.eligibility='eligible' and eb.effective_date<=r.period_end and (eb.expiration_date is null or eb.expiration_date>=r.period_start)
    left join public.benefit_plans bp on bp.id=eb.plan_id group by q.employee_id
  ), computed as (
    select q.*,a.worked_minutes,a.worked_days,l.paid_leave_days,a.late_minutes,a.undertime_minutes,a.overtime_minutes,a.absence_minutes,
      round(case q.salary_frequency when 'monthly' then q.base_salary*contribution_factor when 'semi_monthly' then q.base_salary*(case when r.schedule='monthly' then 2 else 1 end)
        when 'daily' then q.daily_rate*(a.worked_days+l.paid_leave_days) else q.hourly_rate*(a.worked_minutes/60.0+8*l.paid_leave_days) end,2) period_basic,
      round(q.monthly_allowances*contribution_factor,2) period_allowances,
      round(q.hourly_rate*a.late_minutes/60.0,2) late_deduction,round(q.hourly_rate*a.undertime_minutes/60.0,2) undertime_deduction,
      round(case when q.salary_frequency in ('monthly','semi_monthly') then q.daily_rate*a.absence_minutes/480.0 else 0 end,2) absence_deduction,
      round(q.hourly_rate*1.25*a.overtime_minutes/60.0,2) overtime_pay,pc.employee_cost,pc.employer_cost,
      (public.sss_monthly_contribution(q.monthly_basic)->>'employee')::numeric*contribution_factor sss_employee,
      (public.sss_monthly_contribution(q.monthly_basic)->>'employer')::numeric*contribution_factor sss_employer,
      (public.philhealth_monthly_contribution(q.monthly_basic)->>'employee')::numeric*contribution_factor philhealth_employee,
      (public.philhealth_monthly_contribution(q.monthly_basic)->>'employer')::numeric*contribution_factor philhealth_employer,
      coalesce((select sum(c.amount) from public.claims c where c.employee_id=q.employee_id and c.status='approved' and (c.included_payroll_run_id is null or c.included_payroll_run_id=r.id)),0) reimbursements
    from rates q join attendance a using(employee_id) join leaves l using(employee_id) join plan_costs pc using(employee_id)
  )
  insert into public.payroll_items(payroll_run_id,employee_id,salary_frequency,daily_rate,hourly_rate,worked_days,paid_leave_days,late_minutes,undertime_minutes,absence_minutes,overtime_minutes,
    basic_salary,allowances,overtime,bonus,benefits,reimbursements,late_deduction,undertime_deduction,absence_deduction,sss_employee,philhealth_employee,withholding_tax,other_deductions,
    sss_employer,philhealth_employer,benefit_employee_deduction,benefit_employer_contribution,taxable_compensation,status,calculation_snapshot)
  select r.id,c.employee_id,c.salary_frequency,round(c.daily_rate,4),round(c.hourly_rate,4),c.worked_days,c.paid_leave_days,c.late_minutes,c.undertime_minutes,c.absence_minutes,c.overtime_minutes,
    c.period_basic,c.period_allowances,c.overtime_pay,coalesce(old.bonus,0),0,c.reimbursements,c.late_deduction,c.undertime_deduction,c.absence_deduction,round(c.sss_employee,2),round(c.philhealth_employee,2),
    public.bir_withholding_tax(greatest(0,c.period_basic+c.period_allowances+c.overtime_pay+coalesce(old.bonus,0)-c.sss_employee-c.philhealth_employee),r.schedule),coalesce(old.other_deductions,0),
    round(c.sss_employer,2),round(c.philhealth_employer,2),round(c.employee_cost,2),round(c.employer_cost,2),
    round(greatest(0,c.period_basic+c.period_allowances+c.overtime_pay+coalesce(old.bonus,0)-c.sss_employee-c.philhealth_employee),2),'ready',
    jsonb_build_object('ruleVersion','PH-2025/BIR-2023-v1','schedule',r.schedule,'monthlyBasic',c.monthly_basic,'regularOvertimeMultiplier',1.25,'statutoryContributionFactor',contribution_factor,'generatedAt',now())
  from computed c left join public.payroll_items old on old.payroll_run_id=r.id and old.employee_id=c.employee_id
  on conflict(payroll_run_id,employee_id) do update set salary_frequency=excluded.salary_frequency,daily_rate=excluded.daily_rate,hourly_rate=excluded.hourly_rate,worked_days=excluded.worked_days,
    paid_leave_days=excluded.paid_leave_days,late_minutes=excluded.late_minutes,undertime_minutes=excluded.undertime_minutes,absence_minutes=excluded.absence_minutes,overtime_minutes=excluded.overtime_minutes,
    basic_salary=excluded.basic_salary,allowances=excluded.allowances,overtime=excluded.overtime,attendance_adjustments=0,benefits=excluded.benefits,reimbursements=excluded.reimbursements,late_deduction=excluded.late_deduction,
    undertime_deduction=excluded.undertime_deduction,absence_deduction=excluded.absence_deduction,sss_employee=excluded.sss_employee,philhealth_employee=excluded.philhealth_employee,
    withholding_tax=excluded.withholding_tax,sss_employer=excluded.sss_employer,philhealth_employer=excluded.philhealth_employer,benefit_employee_deduction=excluded.benefit_employee_deduction,
    benefit_employer_contribution=excluded.benefit_employer_contribution,taxable_compensation=excluded.taxable_compensation,calculation_snapshot=excluded.calculation_snapshot,updated_at=now();

  delete from public.payroll_items i where i.payroll_run_id=r.id and not exists(
    select 1 from public.profiles p where p.id=i.employee_id and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status in ('active','on_leave') and (p.hired_at is null or p.hired_at<=r.period_end)
      and exists(select 1 from public.employee_compensation_history h where h.employee_id=p.id and h.effective_from<=r.period_end and (h.effective_to is null or h.effective_to>=r.period_start))
  );
  update public.claims c set included_payroll_run_id=r.id where c.status='approved' and c.included_payroll_run_id is null and exists(select 1 from public.payroll_items i where i.payroll_run_id=r.id and i.employee_id=c.employee_id);
  update public.payroll_runs set calculated_at=now(),rule_version='PH-2025/BIR-2023-v1' where id=r.id;
  select employee_count into n from public.payroll_runs where id=r.id;
  return jsonb_build_object('runId',r.id,'employees',n,'ruleVersion','PH-2025/BIR-2023-v1');
end $$;
revoke all on function public.calculate_payroll_run(uuid) from public;
grant execute on function public.calculate_payroll_run(uuid) to authenticated;

create or replace function public.payroll_run_report(p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view payroll reports' using errcode='42501'; end if;
  if not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) and not exists(select 1 from public.payroll_items where payroll_run_id=p_run_id and employee_id=auth.uid()) then raise exception 'Your role cannot view this report' using errcode='42501'; end if;
  select jsonb_build_object('run',to_jsonb(r),'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'employeeId',i.employee_id,'employeeNumber',p.employee_number,'employeeName',p.first_name||' '||p.last_name,'department',coalesce(d.name,'Unassigned'),
    'salaryFrequency',i.salary_frequency,'dailyRate',i.daily_rate,'hourlyRate',i.hourly_rate,'workedDays',i.worked_days,'paidLeaveDays',i.paid_leave_days,
    'lateMinutes',i.late_minutes,'undertimeMinutes',i.undertime_minutes,'absenceMinutes',i.absence_minutes,'overtimeMinutes',i.overtime_minutes,
    'basicSalary',i.basic_salary,'allowances',i.allowances,'overtimePay',i.overtime,'bonus',i.bonus,'benefits',i.benefits,'reimbursements',i.reimbursements,'grossPay',i.gross_pay,
    'lateDeduction',i.late_deduction,'undertimeDeduction',i.undertime_deduction,'absenceDeduction',i.absence_deduction,'sssEmployee',i.sss_employee,
    'philhealthEmployee',i.philhealth_employee,'withholdingTax',i.withholding_tax,'benefitDeduction',i.benefit_employee_deduction,'otherDeductions',i.other_deductions,
    'totalDeductions',i.deductions,'sssEmployer',i.sss_employer,'philhealthEmployer',i.philhealth_employer,'benefitEmployer',i.benefit_employer_contribution,
    'employerContributions',i.contributions,'netPay',i.net_pay,'status',i.status,'calculation',i.calculation_snapshot) order by p.last_name,p.first_name)
    from public.payroll_items i join public.profiles p on p.id=i.employee_id left join public.departments d on d.id=p.department_id
    where i.payroll_run_id=r.id and (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) or i.employee_id=auth.uid())),'[]'::jsonb))
  into result from public.payroll_runs r where r.id=p_run_id;
  if result is null then raise exception 'Payroll run not found'; end if;
  return result;
end $$;
revoke all on function public.payroll_run_report(uuid) from public;
grant execute on function public.payroll_run_report(uuid) to authenticated;

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

comment on function public.calculate_payroll_run(uuid) is 'Calculates monthly/daily/hourly payroll from attendance, approved paid leave, benefits, claims, and versioned statutory rules. Holiday/rest-day premiums require a reviewed adjustment.';
