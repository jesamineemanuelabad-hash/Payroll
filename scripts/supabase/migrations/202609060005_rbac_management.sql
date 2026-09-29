-- Audited RBAC administration. All permission changes pass through these functions.

revoke insert,update,delete on public.user_roles,public.manager_departments from authenticated,anon;

create or replace function public.admin_access_snapshot(p_search text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin']::public.app_role[]) then
    raise exception 'Only super administrators can manage access' using errcode='42501';
  end if;
  if length(p_search)>200 then raise exception 'Search is too long' using errcode='22023'; end if;
  select jsonb_build_object(
    'users',coalesce((select jsonb_agg(to_jsonb(x) order by x."isSystemOwner" desc,x."lastName",x."firstName") from (
      select p.id,p.employee_number "employeeNumber",p.first_name "firstName",p.last_name "lastName",p.email,p.job_title "jobTitle",
        p.location,p.employment_status "employmentStatus",p.is_payroll_employee "isPayrollEmployee",p.is_system_owner "isSystemOwner",
        coalesce((select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id=p.id),'[]'::jsonb) roles,
        coalesce((select jsonb_agg(md.department_id order by md.department_id) from public.manager_departments md where md.manager_id=p.id),'[]'::jsonb) "departmentIds",
        p.updated_at "updatedAt"
      from public.profiles p
      where p_search='' or strpos(lower(concat_ws(' ',p.employee_number,p.first_name,p.last_name,p.email,p.job_title)),lower(p_search))>0
      limit 500
    ) x),'[]'::jsonb),
    'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'code',d.code) order by d.name) from public.departments d),'[]'::jsonb),
    'availableRoles',to_jsonb(enum_range(null::public.app_role)::text[])
  ) into result;
  return result;
end $$;
revoke all on function public.admin_access_snapshot(text) from public,anon;
grant execute on function public.admin_access_snapshot(text) to authenticated;

create or replace function public.admin_update_user_access(
  p_user_id uuid,p_roles text[],p_department_ids uuid[],p_is_payroll_employee boolean,p_employment_status text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles; old_access jsonb; new_access jsonb; role_name text;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin']::public.app_role[]) then raise exception 'Only super administrators can manage access' using errcode='42501'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found then raise exception 'User profile not found' using errcode='P0002'; end if;
  if cardinality(p_roles) is null or cardinality(p_roles)=0 or cardinality(p_roles)>6 then raise exception 'Assign at least one valid role' using errcode='22023'; end if;
  if p_employment_status not in ('active','on_leave','terminated') then raise exception 'Invalid account status' using errcode='22023'; end if;
  if cardinality(coalesce(p_department_ids,array[]::uuid[]))>100 then raise exception 'Too many department scopes' using errcode='22023'; end if;
  foreach role_name in array p_roles loop
    if role_name not in ('super_admin','hr_admin','payroll_manager','hr_manager','manager','employee') then raise exception 'Invalid role' using errcode='22023'; end if;
  end loop;
  if cardinality(p_roles)<>cardinality(array(select distinct unnest(p_roles))) then raise exception 'Duplicate roles are not allowed' using errcode='22023'; end if;

  old_access:=jsonb_build_object('roles',coalesce((select jsonb_agg(role::text order by role::text) from public.user_roles where user_id=p_user_id),'[]'::jsonb),
    'departmentIds',coalesce((select jsonb_agg(department_id order by department_id) from public.manager_departments where manager_id=p_user_id),'[]'::jsonb),
    'isPayrollEmployee',target.is_payroll_employee,'employmentStatus',target.employment_status);

  if target.is_system_owner and (not ('super_admin'=any(p_roles)) or p_is_payroll_employee or p_employment_status<>'active') then
    raise exception 'The system owner must remain an active, non-payroll super administrator';
  end if;
  if p_user_id=auth.uid() and (not ('super_admin'=any(p_roles)) or p_employment_status<>'active') then
    raise exception 'You cannot remove or deactivate your own administrative access';
  end if;
  if exists(select 1 from public.user_roles where user_id=p_user_id and role='super_admin') and not ('super_admin'=any(p_roles))
     and (select count(*) from public.user_roles where role='super_admin')<=1 then raise exception 'At least one super administrator is required'; end if;
  if not ('manager'=any(p_roles)) and cardinality(coalesce(p_department_ids,array[]::uuid[]))>0 then raise exception 'Department scope requires the manager role'; end if;
  if exists(select 1 from unnest(coalesce(p_department_ids,array[]::uuid[])) x(id) left join public.departments d on d.id=x.id where d.id is null) then raise exception 'A department scope does not exist'; end if;

  delete from public.user_roles where user_id=p_user_id and role::text<>all(p_roles);
  insert into public.user_roles(user_id,role) select p_user_id,x::public.app_role from unnest(p_roles) x on conflict do nothing;
  delete from public.manager_departments where manager_id=p_user_id;
  if 'manager'=any(p_roles) then insert into public.manager_departments(manager_id,department_id) select p_user_id,x from unnest(coalesce(p_department_ids,array[]::uuid[])) x on conflict do nothing; end if;
  update public.profiles set is_payroll_employee=p_is_payroll_employee,employment_status=p_employment_status where id=p_user_id;

  new_access:=jsonb_build_object('roles',to_jsonb(p_roles),'departmentIds',to_jsonb(coalesce(p_department_ids,array[]::uuid[])),
    'isPayrollEmployee',p_is_payroll_employee,'employmentStatus',p_employment_status);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
  values(auth.uid(),'access_updated','access_control',p_user_id::text,old_access,new_access);
  return new_access;
end $$;
revoke all on function public.admin_update_user_access(uuid,text[],uuid[],boolean,text) from public,anon;
grant execute on function public.admin_update_user_access(uuid,text[],uuid[],boolean,text) to authenticated;

create or replace function public.admin_create_invited_profile(
  p_user_id uuid,p_employee_number text,p_first_name text,p_last_name text,p_email text,p_job_title text,p_department_id uuid,p_initial_role text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin']::public.app_role[]) then raise exception 'Only super administrators can create users' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Authentication user not found' using errcode='23503'; end if;
  if p_employee_number!~'^[A-Z0-9_-]{2,32}$' or nullif(btrim(p_first_name),'') is null or nullif(btrim(p_last_name),'') is null
    or nullif(btrim(p_email),'') is null or nullif(btrim(p_job_title),'') is null then raise exception 'Invalid user profile' using errcode='22023'; end if;
  if p_initial_role not in ('super_admin','hr_admin','payroll_manager','hr_manager','manager','employee') then raise exception 'Invalid role' using errcode='22023'; end if;
  insert into public.profiles(id,employee_number,first_name,last_name,email,job_title,department_id,employment_status,is_payroll_employee,is_system_owner)
  values(p_user_id,upper(btrim(p_employee_number)),btrim(p_first_name),btrim(p_last_name),lower(btrim(p_email)),btrim(p_job_title),p_department_id,'active',true,false);
  insert into public.user_roles(user_id,role) values(p_user_id,p_initial_role::public.app_role);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values) values(auth.uid(),'user_invited','access_control',p_user_id::text,
    jsonb_build_object('email',lower(btrim(p_email)),'role',p_initial_role,'employeeNumber',upper(btrim(p_employee_number))));
  select jsonb_build_object('id',p_user_id,'email',lower(btrim(p_email)),'role',p_initial_role) into saved;
  return saved;
end $$;
revoke all on function public.admin_create_invited_profile(uuid,text,text,text,text,text,uuid,text) from public,anon;
grant execute on function public.admin_create_invited_profile(uuid,text,text,text,text,text,uuid,text) to authenticated;

comment on function public.admin_update_user_access(uuid,text[],uuid[],boolean,text) is 'Atomically updates RBAC roles and manager scope with owner/lockout protection and an audit event.';
