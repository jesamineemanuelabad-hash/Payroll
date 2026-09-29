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

  with active_employees as (
    select p.id,p.department_id,p.first_name,p.last_name,p.employee_number
    from public.profiles p
    where p.is_payroll_employee
      and not p.is_system_owner
      and p.employment_status='active'
      and lower(btrim(p.job_title)) not like 'system admin%'
  ),
  current_compensation as (
    select e.id,e.department_id,
      case h.salary_frequency
        when 'semi_monthly' then h.base_salary*2
        when 'daily' then h.base_salary*22
        when 'hourly' then h.base_salary*176
        else h.base_salary
      end as monthly_salary
    from active_employees e
    left join lateral (
      select history.base_salary,history.salary_frequency
      from public.employee_compensation_history history
      where history.employee_id=e.id
        and history.effective_from<=current_date
        and (history.effective_to is null or history.effective_to>=current_date)
      order by history.effective_from desc
      limit 1
    ) h on true
  ),
  employee_summary as (
    select e.department_id,
      count(*)::integer as member_count,
      coalesce(sum(c.monthly_salary),0)::numeric(14,2) as monthly_payroll,
      coalesce(jsonb_agg(jsonb_build_object(
        'id',e.id,
        'name',concat_ws(' ',e.first_name,e.last_name),
        'employeeNumber',e.employee_number
      ) order by e.last_name,e.first_name,e.employee_number),'[]'::jsonb) as members
    from active_employees e
    left join current_compensation c on c.id=e.id
    where e.department_id is not null
    group by e.department_id
  ),
  leads as (
    select md.department_id,
      jsonb_agg(jsonb_build_object(
        'id',p.id,
        'name',concat_ws(' ',p.first_name,p.last_name)
      ) order by p.last_name,p.first_name) as managers
    from public.manager_departments md
    join public.profiles p on p.id=md.manager_id
    join public.user_roles ur on ur.user_id=p.id and ur.role='manager'::public.app_role
    where p.employment_status='active'
      and not p.is_system_owner
    group by md.department_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,
    'name',d.name,
    'code',d.code,
    'updatedAt',d.updated_at,
    'memberCount',coalesce(es.member_count,0),
    'monthlyPayroll',coalesce(es.monthly_payroll,0),
    'members',coalesce(es.members,'[]'::jsonb),
    'managers',coalesce(leads.managers,'[]'::jsonb)
  ) order by d.name),'[]'::jsonb)
  into result
  from public.departments d
  left join employee_summary es on es.department_id=d.id
  left join leads on leads.department_id=d.id;

  return result;
end;
$$;

revoke all on function public.department_cards_snapshot() from public,anon,authenticated;
grant execute on function public.department_cards_snapshot() to authenticated;

comment on function public.department_cards_snapshot() is 'Returns department cards with active payroll headcount, assigned managers, employee initials data and monthly-equivalent base compensation. HR administrator access only.';
