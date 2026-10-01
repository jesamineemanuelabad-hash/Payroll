-- Use the amount approved by Finance as the one-time payroll reimbursement.
create or replace function public.sync_finance_approved_claim_amount()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status='approved' then
    if new.approved_amount<=0 then
      raise exception 'A Finance-approved claim must have a positive approved amount';
    end if;
    new.amount:=new.approved_amount;
  end if;
  return new;
end
$$;

drop trigger if exists sync_finance_approved_claim_amount on public.claims;
create trigger sync_finance_approved_claim_amount
before insert or update of status,approved_amount on public.claims
for each row execute function public.sync_finance_approved_claim_amount();
revoke all on function public.sync_finance_approved_claim_amount() from public,anon,authenticated;

create or replace function public.route_approved_claim_to_expense_period()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  assigned_run_status public.payroll_status;
  matching_run_id uuid;
begin
  if new.status<>'approved' or new.included_payroll_run_id is null then
    return new;
  end if;

  select status into assigned_run_status
  from public.payroll_runs
  where id=new.included_payroll_run_id;
  if assigned_run_status is distinct from 'draft'::public.payroll_status then
    return new;
  end if;

  select id into matching_run_id
  from public.payroll_runs
  where status='draft'
    and period_start<=new.expense_date
    and period_end>=new.expense_date
  order by period_start,pay_date
  limit 1;

  if matching_run_id is not null then
    new.included_payroll_run_id:=matching_run_id;
  end if;
  return new;
end
$$;

drop trigger if exists route_approved_claim_to_expense_period on public.claims;
create trigger route_approved_claim_to_expense_period
before insert or update of status,expense_date,included_payroll_run_id on public.claims
for each row execute function public.route_approved_claim_to_expense_period();
revoke all on function public.route_approved_claim_to_expense_period() from public,anon,authenticated;

create or replace function public.sync_draft_payroll_claim_reimbursements()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  target_employee_id uuid;
begin
  for target_employee_id in
    select distinct ids.employee_id
    from unnest(array[
      case when tg_op<>'INSERT' then old.employee_id end,
      case when tg_op<>'DELETE' then new.employee_id end
    ]) as ids(employee_id)
    where ids.employee_id is not null
  loop
    update public.payroll_items i
    set reimbursements=coalesce((
      select sum(c.amount)
      from public.claims c
      where c.included_payroll_run_id=i.payroll_run_id
        and c.employee_id=i.employee_id
        and c.status='approved'
    ),0)
    from public.payroll_runs r
    where i.employee_id=target_employee_id
      and r.id=i.payroll_run_id
      and r.status='draft'
      and i.reimbursements is distinct from coalesce((
        select sum(c.amount)
        from public.claims c
        where c.included_payroll_run_id=i.payroll_run_id
          and c.employee_id=i.employee_id
          and c.status='approved'
      ),0);
  end loop;
  return coalesce(new,old);
end
$$;

drop trigger if exists sync_draft_payroll_claim_reimbursements on public.claims;
create trigger sync_draft_payroll_claim_reimbursements
after insert or update of status,amount,included_payroll_run_id or delete on public.claims
for each row execute function public.sync_draft_payroll_claim_reimbursements();
revoke all on function public.sync_draft_payroll_claim_reimbursements() from public,anon,authenticated;

with misplaced_claims as (
  select c.id,matching_run.id matching_run_id
  from public.claims c
  join public.payroll_runs assigned_run
    on assigned_run.id=c.included_payroll_run_id
   and assigned_run.status='draft'
  cross join lateral (
    select r.id
    from public.payroll_runs r
    where r.status='draft'
      and r.period_start<=c.expense_date
      and r.period_end>=c.expense_date
      and r.id<>assigned_run.id
    order by r.period_start,r.pay_date
    limit 1
  ) matching_run
  where c.status='approved'
)
update public.claims c
set included_payroll_run_id=m.matching_run_id
from misplaced_claims m
where c.id=m.id;

update public.claims
set amount=approved_amount
where status='approved'
  and included_payroll_run_id is null
  and approved_amount>0
  and amount is distinct from approved_amount;

create or replace function public.payroll_run_report(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in to view payroll reports' using errcode='42501';
  end if;
  if not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[])
     and not exists(select 1 from public.payroll_items where payroll_run_id=p_run_id and employee_id=auth.uid()) then
    raise exception 'Your role cannot view this report' using errcode='42501';
  end if;
  select jsonb_build_object(
    'run',to_jsonb(r)||jsonb_build_object('policy_name',p.name,'policy_version',p.version),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',i.id,'employeeId',i.employee_id,'employeeNumber',e.employee_number,'employeeName',e.first_name||' '||e.last_name,'department',coalesce(d.name,'Unassigned'),
        'salaryFrequency',i.salary_frequency,'dailyRate',i.daily_rate,'hourlyRate',i.hourly_rate,'workedDays',i.worked_days,'paidLeaveDays',i.paid_leave_days,
        'lateMinutes',i.late_minutes,'undertimeMinutes',i.undertime_minutes,'absenceMinutes',i.absence_minutes,'overtimeMinutes',i.overtime_minutes,
        'ordinaryOvertimeMinutes',i.ordinary_overtime_minutes,'restDayOvertimeMinutes',i.rest_day_overtime_minutes,'specialDayOvertimeMinutes',i.special_day_overtime_minutes,
        'regularHolidayOvertimeMinutes',i.regular_holiday_overtime_minutes,'doubleHolidayOvertimeMinutes',i.double_holiday_overtime_minutes,
        'nightMinutes',i.night_minutes,'nightDifferential',i.night_differential,
        'basicSalary',i.basic_salary,'allowances',i.allowances,'overtimePay',i.overtime,'bonus',i.bonus,'benefits',i.benefits,'reimbursements',i.reimbursements,'grossPay',i.gross_pay,
        'claims',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',c.id,'claimNumber',c.claim_number,'category',c.category,'expenseDate',c.expense_date,
            'description',c.description,'amount',c.amount
          ) order by c.expense_date,c.claim_number)
          from public.claims c
          where c.included_payroll_run_id=r.id and c.employee_id=i.employee_id
        ),'[]'::jsonb),
        'lateDeduction',i.late_deduction,'undertimeDeduction',i.undertime_deduction,'absenceDeduction',i.absence_deduction,'sssEmployee',i.sss_employee,
        'philhealthEmployee',i.philhealth_employee,'pagibigEmployee',i.pagibig_employee,'withholdingTax',i.withholding_tax,'taxableCompensation',i.taxable_compensation,'benefitDeduction',i.benefit_employee_deduction,
        'otherDeductions',i.other_deductions,'totalDeductions',i.deductions,'sssEmployer',i.sss_employer,'philhealthEmployer',i.philhealth_employer,
        'pagibigEmployer',i.pagibig_employer,'benefitEmployer',i.benefit_employer_contribution,'employerContributions',i.contributions,'netPay',i.net_pay,
        'status',i.status,'calculation',i.calculation_snapshot
      ) order by e.last_name,e.first_name)
      from public.payroll_items i
      join public.profiles e on e.id=i.employee_id
      left join public.departments d on d.id=e.department_id
      where i.payroll_run_id=r.id
        and (public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) or i.employee_id=auth.uid())
    ),'[]'::jsonb)
  )
  into result
  from public.payroll_runs r
  left join public.payroll_policy_versions p on p.id=r.policy_version_id
  where r.id=p_run_id;
  if result is null then raise exception 'Payroll run not found'; end if;
  return result;
end
$$;

revoke all on function public.payroll_run_report(uuid) from public,anon;
grant execute on function public.payroll_run_report(uuid) to authenticated;

-- Withholding tax uses basic pay net of attendance deductions, plus premiums,
-- less employee statutory contributions. Non-taxable reimbursements stay out.
create or replace function public.calculate_payroll_run_complete(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  r public.payroll_runs;
  result jsonb;
  manual_bonuses jsonb;
  policy_version text;
  validation jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','payroll_manager']::public.app_role[]) then
    raise exception 'Your role cannot calculate payroll' using errcode='42501';
  end if;
  select * into r from public.payroll_runs where id=p_run_id for update;
  if not found then raise exception 'Payroll run not found'; end if;
  select coalesce(
    jsonb_object_agg(i.employee_id::text,greatest(0,i.bonus-coalesce((i.calculation_snapshot->>'compensationBonus')::numeric,0))),
    '{}'::jsonb
  ) into manual_bonuses
  from public.payroll_items i where i.payroll_run_id=p_run_id;

  result:=public.calculate_payroll_run(p_run_id);
  perform public.apply_missing_attendance_weekday_absences(p_run_id);
  policy_version:=public.apply_configurable_payroll_policy(p_run_id);

  with review_bonus as (
    select i.id,i.employee_id,
      coalesce((manual_bonuses->>i.employee_id::text)::numeric,0) manual_bonus,
      coalesce(sum(cr.bonus) filter(where cr.id is not null),0) compensation_bonus
    from public.payroll_items i
    left join public.compensation_reviews cr
      on cr.employee_id=i.employee_id
      and cr.status='implemented'
      and cr.applied_at is not null
      and cr.effective_date<=r.period_end
      and (cr.applied_payroll_run_id is null or cr.applied_payroll_run_id=p_run_id)
    where i.payroll_run_id=p_run_id
    group by i.id,i.employee_id
  ), amounts as (
    select i.id,
      b.manual_bonus+b.compensation_bonus new_bonus,
      b.compensation_bonus,
      greatest(0,
        i.basic_salary-i.absence_deduction-i.late_deduction-i.undertime_deduction+
        i.overtime+i.night_differential-i.sss_employee-i.philhealth_employee-i.pagibig_employee
      ) taxable
    from public.payroll_items i
    join review_bonus b on b.id=i.id
  )
  update public.payroll_items i
  set bonus=a.new_bonus,
      taxable_compensation=round(a.taxable,2),
      withholding_tax=public.bir_withholding_tax(a.taxable,r.schedule),
      calculation_snapshot=i.calculation_snapshot||jsonb_build_object('compensationBonus',a.compensation_bonus)
  from amounts a
  where i.id=a.id;

  update public.compensation_reviews cr
  set applied_payroll_run_id=p_run_id
  where cr.status='implemented'
    and cr.applied_at is not null
    and cr.bonus>0
    and cr.applied_payroll_run_id is null
    and cr.effective_date<=r.period_end
    and exists(
      select 1 from public.payroll_items i
      where i.payroll_run_id=p_run_id and i.employee_id=cr.employee_id
    );

  update public.payroll_runs
  set calculated_at=now(),rule_version=policy_version,validation_status='not_run',validated_at=null
  where id=p_run_id;
  validation:=public.validate_payroll_run(p_run_id);
  return jsonb_build_object(
    'runId',p_run_id,
    'employees',(select employee_count from public.payroll_runs where id=p_run_id),
    'ruleVersion',policy_version,
    'validation',validation
  );
end
$$;

revoke all on function public.calculate_payroll_run_complete(uuid) from public,anon;
grant execute on function public.calculate_payroll_run_complete(uuid) to authenticated;
