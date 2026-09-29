create or replace function public.department_cards_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null
    or not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Only HR administrators can view department cards' using errcode='42501';
  end if;

  with employee_summary as (
    select p.department_id,
      count(*)::integer as member_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,
        'name',concat_ws(' ',p.first_name,p.last_name),
        'employeeNumber',p.employee_number
      ) order by p.last_name,p.first_name,p.employee_number),'[]'::jsonb) as members
    from public.profiles p
    where p.is_payroll_employee
      and not p.is_system_owner
      and p.employment_status='active'
      and lower(btrim(p.job_title)) not like 'system admin%'
      and p.department_id is not null
    group by p.department_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'name',d.name,
    'code',d.code,
    'updatedAt',d.updated_at,
    'memberCount',coalesce(es.member_count,0),
    'members',coalesce(es.members,'[]'::jsonb)
  ) order by d.name),'[]'::jsonb)
  into result
  from public.departments d
  left join employee_summary es on es.department_id=d.id;

  return result;
end;
$$;

revoke all on function public.department_cards_snapshot() from public,anon,authenticated;
grant execute on function public.department_cards_snapshot() to authenticated;

comment on function public.department_cards_snapshot() is 'Returns department cards with active payroll headcount and employee initials data. Department-lead and payroll summaries are intentionally omitted. HR administrator access only.';
