create or replace function public.cap_payroll_absence_deduction()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  available_for_absence numeric;
begin
  available_for_absence:=greatest(0,round(
    new.basic_salary+new.allowances+new.overtime+new.night_differential+new.bonus+
    new.attendance_adjustments+new.benefits+new.reimbursements-
    new.late_deduction-new.undertime_deduction-new.sss_employee-new.philhealth_employee-
    new.pagibig_employee-new.withholding_tax-new.benefit_employee_deduction-new.other_deductions,
    2
  ));
  if new.absence_deduction>available_for_absence then
    new.calculation_snapshot:=new.calculation_snapshot||jsonb_build_object(
      'absenceDeductionCapped',true,
      'absenceDeductionBeforeCap',new.absence_deduction,
      'absenceDeductionCap',available_for_absence
    );
    new.absence_deduction:=available_for_absence;
  end if;
  return new;
end
$$;

create trigger cap_payroll_absence_deduction
before insert or update on public.payroll_items
for each row execute function public.cap_payroll_absence_deduction();

create or replace function public.apply_missing_attendance_weekday_absences(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  changed_count integer;
begin
  with assumed_absences as (
    select i.id,count(*)::integer*480 absence_minutes
    from public.payroll_items i
    join public.payroll_runs r on r.id=i.payroll_run_id
    join public.profiles p on p.id=i.employee_id
    cross join lateral generate_series(
      greatest(r.period_start,coalesce(p.hired_at,r.period_start))::timestamp,
      r.period_end::timestamp,
      interval '1 day'
    ) scheduled(workday)
    where i.payroll_run_id=p_run_id
      and i.status<>'excluded'
      and not exists(
        select 1 from public.attendance_records a
        where a.employee_id=i.employee_id
          and a.attendance_date between r.period_start and r.period_end
      )
      and extract(isodow from scheduled.workday) between 1 and 5
      and not exists(
        select 1 from public.leave_requests l
        where l.employee_id=i.employee_id
          and l.status='approved'
          and l.is_paid
          and scheduled.workday::date between l.start_date and l.end_date
      )
    group by i.id
  )
  update public.payroll_items i
  set absence_minutes=a.absence_minutes,
      calculation_snapshot=i.calculation_snapshot||jsonb_build_object(
        'missingAttendanceTreatedAsWeekdayAbsence',true,
        'assumedAbsenceMinutes',a.absence_minutes,
        'assumedAbsenceDays',a.absence_minutes/480.0
      )
  from assumed_absences a
  where i.id=a.id and i.absence_minutes is distinct from a.absence_minutes;
  get diagnostics changed_count=row_count;
  return changed_count;
end
$$;
revoke all on function public.apply_missing_attendance_weekday_absences(uuid) from public,anon,authenticated;

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
      greatest(0,i.basic_salary+i.allowances+i.overtime+i.night_differential+
        b.manual_bonus+b.compensation_bonus-i.sss_employee-i.philhealth_employee-i.pagibig_employee) taxable
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
