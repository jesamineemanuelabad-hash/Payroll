-- One-time administrator bootstrap used by the protected /setup form.
-- The service role can call this only while no super_admin exists.
create or replace function public.bootstrap_first_admin(
  p_user_id uuid,
  p_employee_number text,
  p_first_name text,
  p_last_name text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize concurrent setup attempts before checking whether an admin exists.
  perform pg_advisory_xact_lock(hashtextextended('payroll:first-admin-bootstrap', 0));

  if exists (
    select 1
    from public.user_roles
    where role = 'super_admin'::public.app_role
  ) then
    raise exception 'The first administrator has already been created.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'The authentication user does not exist.' using errcode = '23503';
  end if;

  if p_employee_number !~ '^[A-Z0-9_-]{2,32}$'
    or nullif(btrim(p_first_name), '') is null
    or nullif(btrim(p_last_name), '') is null
    or nullif(btrim(p_email), '') is null then
    raise exception 'Administrator profile values are invalid.' using errcode = '22023';
  end if;

  insert into public.profiles (
    id, employee_number, first_name, last_name, email,
    job_title, employment_status
  ) values (
    p_user_id,
    upper(btrim(p_employee_number)),
    btrim(p_first_name),
    btrim(p_last_name),
    lower(btrim(p_email)),
    'System Administrator',
    'active'
  );

  insert into public.user_roles (user_id, role)
  values (p_user_id, 'super_admin'::public.app_role);
end;
$$;

revoke all on function public.bootstrap_first_admin(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text,text,text,text) to service_role;

comment on function public.bootstrap_first_admin(uuid,text,text,text,text) is
  'Creates the first application profile and super_admin role. Server-only service-role callers; permanently refuses once a super_admin exists.';
