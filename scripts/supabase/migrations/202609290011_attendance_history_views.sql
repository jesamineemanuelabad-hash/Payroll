create or replace function public.attendance_calendar_month(p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('date', attendance_date, 'recordCount', record_count)
    order by attendance_date
  ), '[]'::jsonb)
  from (
    select a.attendance_date, count(*)::integer as record_count
    from public.attendance_records a
    where a.attendance_date between p_from and p_to
    group by a.attendance_date
  ) dates;
$$;

create or replace function public.attendance_records_for_date(p_date date)
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'employeeId', p.id,
      'employeeNumber', p.employee_number,
      'employeeName', concat_ws(' ', p.first_name, p.last_name),
      'departmentId', p.department_id,
      'departmentName', d.name,
      'attendanceDate', a.attendance_date,
      'classification', a.classification::text,
      'timeIn', a.time_in,
      'timeOut', a.time_out,
      'workedMinutes', a.worked_minutes,
      'lateMinutes', a.late_minutes,
      'undertimeMinutes', a.undertime_minutes,
      'overtimeMinutes', a.overtime_minutes,
      'absenceMinutes', a.absence_minutes,
      'nightMinutes', a.night_minutes,
      'workDayType', a.work_day_type,
      'approvedLeave', a.approved_leave
    ) order by p.last_name, p.first_name, p.employee_number
  ), '[]'::jsonb)
  from public.attendance_records a
  join public.profiles p on p.id=a.employee_id
  left join public.departments d on d.id=p.department_id
  where a.attendance_date=p_date;
$$;

create or replace function public.employee_attendance_history(
  p_employee_id uuid,
  p_page integer default 0,
  p_size integer default 30
)
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'employee', (
      select jsonb_build_object(
        'id', p.id,
        'employeeNumber', p.employee_number,
        'employeeName', concat_ws(' ', p.first_name, p.last_name),
        'departmentName', d.name
      )
      from public.profiles p
      left join public.departments d on d.id=p.department_id
      where p.id=p_employee_id
        and not p.is_system_owner
        and lower(btrim(p.job_title)) not like 'system admin%'
    ),
    'totalCount', (
      select count(*)::integer
      from public.attendance_records a
      where a.employee_id=p_employee_id
    ),
    'records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'attendanceDate', a.attendance_date,
          'classification', a.classification::text,
          'timeIn', a.time_in,
          'timeOut', a.time_out,
          'workedMinutes', a.worked_minutes,
          'lateMinutes', a.late_minutes,
          'undertimeMinutes', a.undertime_minutes,
          'overtimeMinutes', a.overtime_minutes,
          'absenceMinutes', a.absence_minutes,
          'nightMinutes', a.night_minutes,
          'workDayType', a.work_day_type,
          'approvedLeave', a.approved_leave
        ) order by a.attendance_date desc, a.created_at desc
      )
      from (
        select record.*
        from public.attendance_records record
        where record.employee_id=p_employee_id
        order by record.attendance_date desc, record.created_at desc
        limit p_size offset p_page * p_size
      ) a
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.attendance_calendar_month(date,date) from public, anon;
revoke all on function public.attendance_records_for_date(date) from public, anon;
revoke all on function public.employee_attendance_history(uuid,integer,integer) from public, anon;
grant execute on function public.attendance_calendar_month(date,date) to authenticated;
grant execute on function public.attendance_records_for_date(date) to authenticated;
grant execute on function public.employee_attendance_history(uuid,integer,integer) to authenticated;

comment on function public.attendance_calendar_month(date,date) is 'Returns attendance record counts per date for the requested calendar range, respecting attendance row-level security.';
comment on function public.attendance_records_for_date(date) is 'Returns attendance details for one date, respecting attendance and employee row-level security.';
comment on function public.employee_attendance_history(uuid,integer,integer) is 'Returns a permitted employee’s paginated attendance history, respecting attendance and employee row-level security.';
