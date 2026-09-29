create or replace function public.today_attendance_snapshot()
returns jsonb
language sql stable security invoker set search_path=''
as $$
  select jsonb_build_object(
    'date', (now() at time zone 'Asia/Manila')::date,
    'expectedCount', count(*),
    'records', coalesce(jsonb_agg(
      jsonb_build_object(
        'id', coalesce(a.id, p.id),
        'employeeId', p.id,
        'employeeNumber', p.employee_number,
        'employeeName', concat_ws(' ', p.first_name, p.last_name),
        'departmentId', p.department_id,
        'departmentName', d.name,
        'classification', coalesce(a.classification::text, 'no_record'),
        'timeIn', a.time_in,
        'timeOut', a.time_out,
        'lateMinutes', coalesce(a.late_minutes, 0),
        'hasAttendance', a.id is not null
      ) order by p.last_name, p.first_name, p.employee_number
    ), '[]'::jsonb)
  )
  from public.profiles p
  left join public.departments d on d.id=p.department_id
  left join public.attendance_records a
    on a.employee_id=p.id
    and a.attendance_date=(now() at time zone 'Asia/Manila')::date
  where p.is_payroll_employee
    and not p.is_system_owner
    and p.employment_status='active'
    and lower(btrim(p.job_title)) not like 'system admin%';
$$;

revoke all on function public.today_attendance_snapshot() from public, anon;
grant execute on function public.today_attendance_snapshot() to authenticated;

comment on function public.today_attendance_snapshot() is 'Returns today’s attendance for active payroll employees, excluding system owners and system administrator profiles, with department labels and no-record roster entries.';
