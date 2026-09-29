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
        'classification', coalesce(a.classification::text, 'no_record'),
        'timeIn', a.time_in,
        'timeOut', a.time_out,
        'lateMinutes', coalesce(a.late_minutes, 0),
        'hasAttendance', a.id is not null
      ) order by p.last_name, p.first_name, p.employee_number
    ), '[]'::jsonb)
  )
  from public.profiles p
  left join public.attendance_records a
    on a.employee_id=p.id
    and a.attendance_date=(now() at time zone 'Asia/Manila')::date
  where p.is_payroll_employee
    and not p.is_system_owner
    and p.employment_status='active';
$$;

revoke all on function public.today_attendance_snapshot() from public, anon;
grant execute on function public.today_attendance_snapshot() to authenticated;

create or replace function public.require_payroll_employee()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id=new.employee_id
      and is_payroll_employee
      and not is_system_owner
  ) then
    raise exception 'System accounts cannot be used as employee records';
  end if;
  return new;
end;
$$;

comment on function public.today_attendance_snapshot() is 'Returns today’s attendance joined to active payroll employees; employees without a record are shown as no_record.';
comment on function public.require_payroll_employee() is 'Requires payroll and attendance records to reference an active payroll employee, excluding system accounts.';
