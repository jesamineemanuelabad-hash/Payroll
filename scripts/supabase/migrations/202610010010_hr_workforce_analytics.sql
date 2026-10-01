create or replace function public.hr_analytics_snapshot(
  p_months integer default 12,
  p_department_id uuid default null,
  p_location text default null,
  p_employment_type text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  range_start date := (date_trunc('month', current_date) - make_interval(months => p_months - 1))::date;
  range_end date := (date_trunc('month', current_date) + interval '1 month')::date;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin','payroll_manager','hr_manager']::public.app_role[]) then
    raise exception 'Your role cannot view HR analytics' using errcode = '42501';
  end if;
  if p_months not in (3,6,12) then raise exception 'Invalid reporting range' using errcode = '22023'; end if;

  with
  scoped_profiles as (
    select p.*
    from public.profiles p
    where p.is_payroll_employee and not p.is_system_owner
      and (p_department_id is null or p.department_id = p_department_id)
      and (p_location is null or p.location = p_location)
      and (p_employment_type is null or p.employment_type = p_employment_type)
  ),
  workforce as (
    select * from scoped_profiles where employment_status in ('active','on_leave')
  ),
  months as (
    select month_start::date,
      to_char(month_start, 'Mon') label
    from generate_series(
      date_trunc('month', current_date) - make_interval(months => p_months - 1),
      date_trunc('month', current_date), interval '1 month'
    ) month_start
  ),
  hiring_trend as (
    select m.month_start, m.label, count(p.id)::integer hires
    from months m
    left join scoped_profiles p on p.hired_at >= m.month_start
      and p.hired_at < (m.month_start + interval '1 month')::date
      and p.hired_at <= current_date
    group by m.month_start,m.label
  ),
  tenure as (
    select p.id,
      (extract(year from age(current_date, p.hired_at))::integer * 12
        + extract(month from age(current_date, p.hired_at))::integer) months
    from workforce p where p.hired_at is not null
  ),
  current_compensation as (
    select p.id,
      case h.salary_frequency
        when 'semi_monthly' then h.base_salary * 2
        when 'daily' then h.base_salary * 22
        when 'hourly' then h.base_salary * 176
        else h.base_salary
      end monthly_salary
    from workforce p
    join lateral (
      select history.base_salary,history.salary_frequency
      from public.employee_compensation_history history
      where history.employee_id = p.id
        and history.effective_from <= current_date
        and (history.effective_to is null or history.effective_to >= current_date)
      order by history.effective_from desc limit 1
    ) h on true
  ),
  attendance as (
    select a.*
    from public.attendance_records a
    join workforce p on p.id = a.employee_id
    where a.attendance_date >= range_start and a.attendance_date < range_end
      and a.attendance_date <= current_date
  ),
  leave_requests as (
    select l.*
    from public.leave_requests l
    join workforce p on p.id = l.employee_id
    where l.start_date >= range_start and l.start_date < range_end
      and l.status not in ('draft','cancelled')
  ),
  active_benefits as (
    select distinct b.employee_id
    from public.employee_benefits b
    join workforce p on p.id = b.employee_id
    where b.status = 'active' and b.effective_date <= current_date
      and (b.expiration_date is null or b.expiration_date >= current_date)
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'options', jsonb_build_object(
      'departments', coalesce((
        select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.name)
        from public.departments d
      ), '[]'::jsonb),
      'locations', coalesce((
        select jsonb_agg(x.location order by x.location)
        from (select distinct location from scoped_profiles where location is not null and btrim(location) <> '') x
      ), '[]'::jsonb),
      'employmentTypes', coalesce((
        select jsonb_agg(x.employment_type order by x.employment_type)
        from (select distinct employment_type from scoped_profiles) x
      ), '[]'::jsonb)
    ),
    'summary', jsonb_build_object(
      'headcount',(select count(*) from workforce),
      'activeEmployees',(select count(*) from workforce where employment_status = 'active'),
      'employeesOnLeave',(select count(*) from workforce where employment_status = 'on_leave'),
      'newHires',(select count(*) from scoped_profiles where hired_at >= range_start and hired_at < range_end and hired_at <= current_date),
      'averageTenureMonths',coalesce((select round(avg(months),1) from tenure),0),
      'employeesWithHireDate',(select count(*) from tenure),
      'activeBenefits',(select count(*) from active_benefits)
    ),
    'headcountByDepartment',coalesce((
      select jsonb_agg(jsonb_build_object('name',department_name,'count',employee_count) order by employee_count desc,department_name)
      from (
        select coalesce(d.name,'Unassigned') department_name,count(*)::integer employee_count
        from workforce p left join public.departments d on d.id = p.department_id
        group by coalesce(d.name,'Unassigned')
      ) grouped
    ),'[]'::jsonb),
    'employmentMix',coalesce((
      select jsonb_agg(jsonb_build_object('type',employment_type,'count',employee_count) order by employee_count desc,employment_type)
      from (select employment_type,count(*)::integer employee_count from workforce group by employment_type) grouped
    ),'[]'::jsonb),
    'hiringTrend',coalesce((
      select jsonb_agg(jsonb_build_object('month',month_start,'label',label,'count',hires) order by month_start)
      from hiring_trend
    ),'[]'::jsonb),
    'tenureBands',jsonb_build_array(
      jsonb_build_object('label','Under 1 year','count',(select count(*) from tenure where months < 12)),
      jsonb_build_object('label','1–3 years','count',(select count(*) from tenure where months >= 12 and months < 36)),
      jsonb_build_object('label','3–5 years','count',(select count(*) from tenure where months >= 36 and months < 60)),
      jsonb_build_object('label','5+ years','count',(select count(*) from tenure where months >= 60))
    ),
    'attendance',jsonb_build_object(
      'total',(select count(*) from attendance),
      'lateMinutes',coalesce((select sum(late_minutes) from attendance),0),
      'absenceMinutes',coalesce((select sum(absence_minutes) from attendance),0),
      'classes',(
        select jsonb_agg(jsonb_build_object('classification',k.classification,'count',coalesce(c.record_count,0)) order by k.sort_order)
        from (values ('on_time',1),('late',2),('absent',3),('overtime',4),('on_leave',5)) k(classification,sort_order)
        left join (
          select classification::text classification,count(*)::integer record_count
          from attendance group by classification
        ) c on c.classification = k.classification
      )
    ),
    'leave',jsonb_build_object(
      'submittedRequests',(select count(*) from leave_requests where status = 'submitted'),
      'approvedRequests',(select count(*) from leave_requests where status = 'approved'),
      'rejectedRequests',(select count(*) from leave_requests where status = 'rejected'),
      'approvedDays',coalesce((select sum(total_days) from leave_requests where status = 'approved'),0),
      'submittedDays',coalesce((select sum(total_days) from leave_requests where status = 'submitted'),0),
      'byType',coalesce((
        select jsonb_agg(jsonb_build_object(
          'type',leave_type,
          'approvedDays',approved_days,
          'submittedDays',submitted_days
        ) order by approved_days desc,submitted_days desc,leave_type)
        from (
          select leave_type,
            coalesce(sum(total_days) filter (where status = 'approved'),0) approved_days,
            coalesce(sum(total_days) filter (where status = 'submitted'),0) submitted_days
          from leave_requests group by leave_type
        ) grouped
      ),'[]'::jsonb)
    ),
    'compensationBands',jsonb_build_array(
      jsonb_build_object('label','Under ₱30K','count',(select count(*) from current_compensation where monthly_salary < 30000)),
      jsonb_build_object('label','₱30K–45K','count',(select count(*) from current_compensation where monthly_salary >= 30000 and monthly_salary < 45000)),
      jsonb_build_object('label','₱45K–60K','count',(select count(*) from current_compensation where monthly_salary >= 45000 and monthly_salary < 60000)),
      jsonb_build_object('label','₱60K–80K','count',(select count(*) from current_compensation where monthly_salary >= 60000 and monthly_salary < 80000)),
      jsonb_build_object('label','₱80K–100K','count',(select count(*) from current_compensation where monthly_salary >= 80000 and monthly_salary < 100000)),
      jsonb_build_object('label','₱100K–150K','count',(select count(*) from current_compensation where monthly_salary >= 100000 and monthly_salary < 150000)),
      jsonb_build_object('label','Over ₱150K','count',(select count(*) from current_compensation where monthly_salary >= 150000))
    )
  ) into result;
  return result;
end $$;

revoke all on function public.hr_analytics_snapshot(integer,uuid,text,text) from public,anon;
grant execute on function public.hr_analytics_snapshot(integer,uuid,text,text) to authenticated;
comment on function public.hr_analytics_snapshot(integer,uuid,text,text) is
  'Permission-checked, privacy-preserving HR workforce aggregates for headcount, hiring, tenure, attendance, leave, benefits, and compensation distribution.';
