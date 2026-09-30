create table public.job_positions (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  salary_min numeric(12,2) not null check (salary_min >= 0),
  salary_max numeric(12,2) check (salary_max is null or salary_max >= salary_min),
  salary_max_open boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, title),
  constraint job_positions_open_ceiling_requires_max check (not salary_max_open or salary_max is not null)
);

alter table public.job_positions enable row level security;
grant select on public.job_positions to authenticated;
grant all on public.job_positions to service_role;
create policy "authenticated users read position catalog"
  on public.job_positions for select to authenticated using (true);

create trigger set_job_positions_updated_at
  before update on public.job_positions
  for each row execute function public.set_updated_at();

create or replace function public.seed_demo_org_structure(
  p_departments jsonb,
  p_positions jsonb,
  p_employees jsonb,
  p_effective_date date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  employee_item jsonb;
  v_department_id uuid;
  existing_profile public.profiles;
  current_history jsonb;
  effective_salary numeric(12,2);
  employee_count integer := 0;
  position_count integer := 0;
  new_profile boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Only a service-role caller can seed the demo organization' using errcode='42501';
  end if;
  if jsonb_typeof(p_departments) <> 'array' or jsonb_array_length(p_departments) <> 12
     or jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) <> 98
     or jsonb_typeof(p_employees) <> 'array' or jsonb_array_length(p_employees) <> 98
     or p_effective_date is null then
    raise exception 'The organization seed must include 12 departments, 98 positions, and 98 employee assignments' using errcode='22023';
  end if;

  for item in select value from jsonb_array_elements(p_departments)
  loop
    if nullif(btrim(item->>'code'),'') is null or nullif(btrim(item->>'name'),'') is null then
      raise exception 'Invalid department in organization seed' using errcode='22023';
    end if;
    insert into public.departments(name,code)
    values (btrim(item->>'name'),upper(btrim(item->>'code')))
    on conflict (code) do update set name=excluded.name
      where public.departments.name is distinct from excluded.name;
  end loop;

  for item in select value from jsonb_array_elements(p_positions)
  loop
    select d.id into v_department_id
    from public.departments d
    where d.code=upper(btrim(item->>'departmentCode'));
    if v_department_id is null or nullif(btrim(item->>'title'),'') is null
       or (item->>'salaryMinimum') is null then
      raise exception 'Invalid job position in organization seed' using errcode='22023';
    end if;
    insert into public.job_positions(department_id,title,salary_min,salary_max,salary_max_open)
    values (v_department_id,btrim(item->>'title'),(item->>'salaryMinimum')::numeric,
      nullif(item->>'salaryMaximum','')::numeric,coalesce((item->>'salaryMaxOpen')::boolean,false))
    on conflict (department_id,title) do update set
      salary_min=excluded.salary_min,
      salary_max=excluded.salary_max,
      salary_max_open=excluded.salary_max_open
      where (public.job_positions.salary_min,public.job_positions.salary_max,public.job_positions.salary_max_open)
        is distinct from (excluded.salary_min,excluded.salary_max,excluded.salary_max_open);
    position_count := position_count+1;
  end loop;

  for employee_item in select value from jsonb_array_elements(p_employees)
  loop
    if nullif(employee_item->>'id','') is null
       or nullif(btrim(employee_item->>'employeeNumber'),'') is null
       or nullif(btrim(employee_item->>'firstName'),'') is null
       or nullif(btrim(employee_item->>'lastName'),'') is null
       or nullif(btrim(employee_item->>'email'),'') is null
       or nullif(btrim(employee_item->>'jobTitle'),'') is null
       or nullif(btrim(employee_item->>'departmentCode'),'') is null
       or (employee_item->>'salaryMinimum') is null then
      raise exception 'Invalid employee assignment in organization seed' using errcode='22023';
    end if;

    select d.id into v_department_id
    from public.departments d
    where d.code=upper(btrim(employee_item->>'departmentCode'));
    if v_department_id is null or not exists (
      select 1 from public.job_positions jp
      where jp.department_id=v_department_id
        and jp.title=btrim(employee_item->>'jobTitle')
        and jp.salary_min=(employee_item->>'salaryMinimum')::numeric
    ) then
      raise exception 'Employee assignment does not match a seeded position' using errcode='22023';
    end if;
    effective_salary := (employee_item->>'salaryMinimum')::numeric;

    select * into existing_profile
    from public.profiles p
    where p.id=(employee_item->>'id')::uuid
    for update;
    new_profile := not found;
    if new_profile then
      if not exists(select 1 from auth.users u where u.id=(employee_item->>'id')::uuid) then
        raise exception 'Demo employee identity is missing from Supabase Auth' using errcode='23503';
      end if;
      insert into public.profiles(
        id,employee_number,first_name,last_name,email,department_id,job_title,
        employment_status,hired_at,is_payroll_employee,is_system_owner
      ) values (
        (employee_item->>'id')::uuid,btrim(employee_item->>'employeeNumber'),
        btrim(employee_item->>'firstName'),btrim(employee_item->>'lastName'),
        lower(btrim(employee_item->>'email')),v_department_id,
        btrim(employee_item->>'jobTitle'),'active',p_effective_date,true,false
      );
    else
      if existing_profile.is_system_owner or not existing_profile.is_payroll_employee
         or existing_profile.employment_status <> 'active'
         or lower(existing_profile.job_title) like '%system administrator%'
         or lower(existing_profile.job_title) like '%system admin%' then
        raise exception 'Organization seed cannot alter protected or inactive profiles' using errcode='42501';
      end if;
      if existing_profile.department_id is distinct from v_department_id
         or existing_profile.job_title is distinct from btrim(employee_item->>'jobTitle') then
        update public.profiles
        set department_id=v_department_id,
            job_title=btrim(employee_item->>'jobTitle')
        where id=existing_profile.id;
        insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
        values (
          null,'demo_org_chart_seed','profiles',existing_profile.id::text,
          jsonb_build_object('department_id',existing_profile.department_id,'job_title',existing_profile.job_title),
          jsonb_build_object('department_id',v_department_id,'job_title',btrim(employee_item->>'jobTitle'))
        );
      end if;
    end if;

    if exists (
      select 1 from public.employee_compensation_history h
      where h.employee_id=(employee_item->>'id')::uuid
        and h.effective_from>p_effective_date
    ) then
      raise exception 'Future-dated salary history exists for employee %',employee_item->>'employeeNumber' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'effectiveFrom',h.effective_from,'effectiveTo',h.effective_to,'baseSalary',h.base_salary
    ) order by h.effective_from),'[]'::jsonb)
    into current_history
    from public.employee_compensation_history h
    where h.employee_id=(employee_item->>'id')::uuid
      and h.effective_from<=p_effective_date
      and (h.effective_to is null or h.effective_to>=p_effective_date);

    if not exists (
      select 1 from public.employee_compensation_history h
      where h.employee_id=(employee_item->>'id')::uuid
        and h.effective_from=p_effective_date
        and h.base_salary=effective_salary
        and h.salary_frequency='monthly'
        and h.effective_to is null
        and h.source='manual'
    ) then
      update public.employee_compensation_history
      set effective_to=p_effective_date-1
      where employee_id=(employee_item->>'id')::uuid
        and effective_from<p_effective_date
        and (effective_to is null or effective_to>=p_effective_date);

      insert into public.employee_compensation_history(
        employee_id,base_salary,salary_frequency,effective_from,effective_to,source,external_id
      ) values (
        (employee_item->>'id')::uuid,effective_salary,'monthly',p_effective_date,null,'manual',
        'DEMO-ORG-'||btrim(employee_item->>'employeeNumber')
      )
      on conflict (employee_id,effective_from) do update set
        base_salary=excluded.base_salary,
        salary_frequency=excluded.salary_frequency,
        effective_to=null,
        source='manual',
        external_id=excluded.external_id;

      insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
      values (
        null,'demo_org_chart_seed','employee_compensation_history',(employee_item->>'id')||':'||p_effective_date::text,
        current_history,
        jsonb_build_object('base_salary',effective_salary,'salary_frequency','monthly','effective_from',p_effective_date)
      );
    end if;
    employee_count := employee_count+1;
  end loop;

  return jsonb_build_object('departments',jsonb_array_length(p_departments),'positions',position_count,'employees',employee_count);
end;
$$;

revoke all on function public.seed_demo_org_structure(jsonb,jsonb,jsonb,date) from public,anon,authenticated;
grant execute on function public.seed_demo_org_structure(jsonb,jsonb,jsonb,date) to service_role;
