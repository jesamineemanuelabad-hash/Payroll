-- Live data-quality and payroll deduction totals for HR Analytics.
-- Values are derived from saved attendance, effective salary history, and the latest payroll ledger.

create or replace function public.analytics_accuracy_snapshot(
  p_months integer default 12,
  p_department_id uuid default null,
  p_location text default null,
  p_employment_type text default null
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin','payroll_manager','hr_manager']::public.app_role[]) then
    raise exception 'Your role cannot view organization analytics' using errcode='42501';
  end if;
  if p_months not in (3,6,12) then raise exception 'Invalid reporting range' using errcode='22023'; end if;

  with workforce as (
    select p.id
    from public.profiles p
    where p.is_payroll_employee and not p.is_system_owner and p.employment_status='active'
      and (p_department_id is null or p.department_id=p_department_id)
      and (p_location is null or p.location=p_location)
      and (p_employment_type is null or p.employment_type=p_employment_type)
  ), salaries as (
    select w.id, exists(
      select 1 from public.employee_compensation_history h
      where h.employee_id=w.id and h.effective_from<=current_date
        and (h.effective_to is null or h.effective_to>=current_date)
    ) has_salary from workforce w
  ), attendance as (
    select a.* from public.attendance_records a join workforce w on w.id=a.employee_id
    where a.attendance_date >= (current_date-make_interval(months=>p_months))::date
  ), latest_run as (
    select r.* from public.payroll_runs r order by r.pay_date desc,r.created_at desc limit 1
  ), latest_items as (
    select i.* from public.payroll_items i join latest_run r on r.id=i.payroll_run_id join workforce w on w.id=i.employee_id
    where i.status<>'excluded'
  )
  select jsonb_build_object(
    'coverage',jsonb_build_object(
      'employees',(select count(*) from workforce),
      'employeesWithSalary',(select count(*) from salaries where has_salary),
      'employeesMissingSalary',(select count(*) from salaries where not has_salary),
      'attendanceEmployees',(select count(distinct employee_id) from attendance),
      'attendanceRecords',(select count(*) from attendance),
      'completeAttendanceRecords',(select count(*) from attendance where classification in ('absent','on_leave') or (time_in is not null and time_out is not null)),
      'incompleteAttendanceRecords',(select count(*) from attendance where classification not in ('absent','on_leave') and (time_in is null or time_out is null))
    ),
    'timeTotals',jsonb_build_object(
      'workedMinutes',coalesce((select sum(worked_minutes) from attendance),0),
      'lateMinutes',coalesce((select sum(late_minutes) from attendance),0),
      'undertimeMinutes',coalesce((select sum(undertime_minutes) from attendance),0),
      'overtimeMinutes',coalesce((select sum(overtime_minutes) from attendance),0),
      'absenceMinutes',coalesce((select sum(absence_minutes) from attendance),0)
    ),
    'payroll',coalesce((select jsonb_build_object(
      'runId',r.id,'periodStart',r.period_start,'periodEnd',r.period_end,'status',r.status,
      'calculatedAt',r.calculated_at,'employeeEntries',(select count(*) from latest_items),
      'missingEmployeeEntries',greatest(0,(select count(*) from salaries where has_salary)-(select count(*) from latest_items)),
      'grossPay',coalesce((select sum(gross_pay) from latest_items),0),
      'totalDeductions',coalesce((select sum(deductions) from latest_items),0),
      'lateDeduction',coalesce((select sum(late_deduction) from latest_items),0),
      'undertimeDeduction',coalesce((select sum(undertime_deduction) from latest_items),0),
      'absenceDeduction',coalesce((select sum(absence_deduction) from latest_items),0),
      'sssEmployee',coalesce((select sum(sss_employee) from latest_items),0),
      'philhealthEmployee',coalesce((select sum(philhealth_employee) from latest_items),0),
      'pagibigEmployee',coalesce((select sum(pagibig_employee) from latest_items),0),
      'withholdingTax',coalesce((select sum(withholding_tax) from latest_items),0),
      'otherDeductions',coalesce((select sum(other_deductions+benefit_employee_deduction) from latest_items),0)
    ) from latest_run r),null)
  ) into result;
  return result;
end $$;

revoke all on function public.analytics_accuracy_snapshot(integer,uuid,text,text) from public,anon;
grant execute on function public.analytics_accuracy_snapshot(integer,uuid,text,text) to authenticated;
comment on function public.analytics_accuracy_snapshot(integer,uuid,text,text) is 'Live attendance completeness, salary coverage, and itemized latest-payroll deductions for HR Analytics.';
