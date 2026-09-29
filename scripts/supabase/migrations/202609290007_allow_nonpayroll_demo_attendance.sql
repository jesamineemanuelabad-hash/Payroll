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
      and not is_system_owner
      and (
        is_payroll_employee
        or (
          tg_table_name='attendance_records'
          and not is_payroll_employee
          and employee_number like 'DEMO-ATT-%'
        )
      )
  ) then
    raise exception 'System accounts cannot be used as employee records';
  end if;
  return new;
end;
$$;

comment on function public.require_payroll_employee() is 'Requires a payroll-eligible employee for payroll records; explicitly marked non-payroll DEMO-ATT profiles may only have attendance test rows.';
