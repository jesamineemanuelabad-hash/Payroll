-- Mandatory TOTP MFA for privileged roles, enforced by the database as well as the UI.

create or replace function public.current_authenticator_assurance_level()
returns text language sql stable security invoker set search_path='' as $$
  select coalesce(auth.jwt()->>'aal','aal1');
$$;
revoke all on function public.current_authenticator_assurance_level() from public,anon;
grant execute on function public.current_authenticator_assurance_level() to authenticated;

create or replace function public.current_user_requires_mfa()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.user_roles
    where user_id=auth.uid()
      and role=any(array['super_admin','hr_admin','payroll_manager','hr_manager']::public.app_role[])
  );
$$;
revoke all on function public.current_user_requires_mfa() from public,anon;
grant execute on function public.current_user_requires_mfa() to authenticated;

create or replace function public.has_mfa()
returns boolean language sql stable security invoker set search_path='' as $$
  select public.current_authenticator_assurance_level()='aal2';
$$;
revoke all on function public.has_mfa() from public,anon;
grant execute on function public.has_mfa() to authenticated;

-- Every existing RLS policy and privileged RPC uses this helper. Replacing it
-- makes MFA a database authorization requirement instead of a frontend-only gate.
create or replace function public.has_any_role(required_roles public.app_role[])
returns boolean
language sql stable security definer
set search_path=''
as $$
  select public.has_workspace_access()
    and exists (
      select 1 from public.user_roles
      where user_id=auth.uid() and role=any(required_roles)
    )
    and (not public.current_user_requires_mfa() or public.has_mfa());
$$;

create or replace function public.workspace_session()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object(
      'userId',p.id,'email',p.email,'firstName',p.first_name,'lastName',p.last_name,
      'employmentStatus',p.employment_status,'isSystemOwner',p.is_system_owner,
      'active',p.employment_status in ('active','on_leave'),
      'mfaRequired',public.current_user_requires_mfa(),
      'authenticatorAssuranceLevel',public.current_authenticator_assurance_level(),
      'roles',case when p.employment_status in ('active','on_leave') then coalesce((
        select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id=p.id
      ),'[]'::jsonb) else '[]'::jsonb end
    ) from public.profiles p where p.id=auth.uid()
  ),jsonb_build_object('active',false,'roles','[]'::jsonb,'mfaRequired',false,'authenticatorAssuranceLevel',public.current_authenticator_assurance_level()));
$$;
revoke all on function public.workspace_session() from public,anon;
grant execute on function public.workspace_session() to authenticated;

comment on function public.has_any_role(public.app_role[]) is 'Checks active RBAC membership and requires an aal2 JWT when the user holds a privileged payroll or HR role.';
comment on function public.current_user_requires_mfa() is 'Returns true for super_admin, hr_admin, payroll_manager, and hr_manager accounts.';
