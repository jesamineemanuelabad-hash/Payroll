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

create or replace function public.payroll_13th_month_snapshot(p_year integer)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null
     or not public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[]) then
    raise exception 'Your role cannot view 13th-month calculations' using errcode='42501';
  end if;
  if p_year < 2000 or p_year > extract(year from current_date)::integer then
    raise exception 'Select a valid completed or current payroll year' using errcode='22023';
  end if;

  select jsonb_build_object(
    'year',p_year,
    'basis','Basic salary from paid payroll entries dated in the selected calendar year, divided by 12.',
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'employeeId',employee_id,
      'employeeNumber',employee_number,
      'employeeName',employee_name,
      'department',department,
      'paidBasicSalary',paid_basic_salary,
      'amount',round(paid_basic_salary/12,2),
      'paidPayrollEntries',paid_payroll_entries
    ) order by employee_name),'[]'::jsonb)
  )
  into result
  from (
    select p.id employee_id,p.employee_number,p.first_name||' '||p.last_name employee_name,
      coalesce(d.name,'Unassigned') department,
      round(sum(i.basic_salary),2) paid_basic_salary,
      count(i.id)::integer paid_payroll_entries
    from public.payroll_items i
    join public.payroll_runs r on r.id=i.payroll_run_id and r.status='paid'
      and r.pay_date>=make_date(p_year,1,1) and r.pay_date<make_date(p_year+1,1,1)
    join public.profiles p on p.id=i.employee_id
    left join public.departments d on d.id=p.department_id
    group by p.id,p.employee_number,p.first_name,p.last_name,d.name
  ) paid;
  return result;
end
$$;

revoke all on function public.payroll_13th_month_snapshot(integer) from public,anon;
grant execute on function public.payroll_13th_month_snapshot(integer) to authenticated;

comment on function public.payroll_13th_month_snapshot(integer) is
  'Calculates a 13th-month estimate from basic salary in paid payroll entries for the selected calendar year, divided by twelve. It does not estimate unpaid or future payroll.';
