-- Keep overlapping draft payrolls from being submitted with stale leave data.
create or replace function public.invalidate_draft_payroll_for_leave_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op<>'INSERT' then
    update public.payroll_runs r
    set calculated_at=null,
        rule_version=null,
        validation_status='not_run',
        validated_at=null,
        updated_at=clock_timestamp()
    where r.status='draft'
      and r.period_start<=old.end_date
      and r.period_end>=old.start_date
      and exists(
        select 1
        from public.payroll_items i
        where i.payroll_run_id=r.id
          and i.employee_id=old.employee_id
      );
  end if;

  if tg_op<>'DELETE' then
    update public.payroll_runs r
    set calculated_at=null,
        rule_version=null,
        validation_status='not_run',
        validated_at=null,
        updated_at=clock_timestamp()
    where r.status='draft'
      and r.period_start<=new.end_date
      and r.period_end>=new.start_date
      and exists(
        select 1
        from public.payroll_items i
        where i.payroll_run_id=r.id
          and i.employee_id=new.employee_id
      );
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.invalidate_draft_payroll_for_leave_change() from public,anon,authenticated;

drop trigger if exists invalidate_draft_payroll_for_leave_change on public.leave_requests;
create trigger invalidate_draft_payroll_for_leave_change
after insert or update or delete on public.leave_requests
for each row execute function public.invalidate_draft_payroll_for_leave_change();
