create table public.email_mfa_verifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  primary key (user_id, session_id),
  constraint email_mfa_verification_expiry check (expires_at > verified_at)
);

alter table public.email_mfa_verifications enable row level security;
revoke all on table public.email_mfa_verifications from public, anon, authenticated;
grant all on table public.email_mfa_verifications to service_role;
create index email_mfa_verifications_expiry_idx on public.email_mfa_verifications(expires_at);

create or replace function public.has_email_mfa_verification()
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists (
    select 1
    from public.email_mfa_verifications v
    where v.user_id=auth.uid()
      and v.session_id=nullif(auth.jwt()->>'session_id','')::uuid
      and v.expires_at>now()
  );
$$;
revoke all on function public.has_email_mfa_verification() from public, anon;
grant execute on function public.has_email_mfa_verification() to authenticated;

create or replace function public.record_email_mfa_verification(p_user_id uuid, p_session_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'Invalid email verification session.';
  end if;
  delete from public.email_mfa_verifications where expires_at<=now();
  insert into public.email_mfa_verifications(user_id,session_id,verified_at,expires_at)
  values (p_user_id,p_session_id,now(),now()+interval '12 hours')
  on conflict (user_id,session_id) do update
    set verified_at=excluded.verified_at,expires_at=excluded.expires_at;
end;
$$;
revoke all on function public.record_email_mfa_verification(uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_email_mfa_verification(uuid,uuid) to service_role;

create or replace function public.has_mfa()
returns boolean language sql stable security definer set search_path='' as $$
  select public.has_email_mfa_verification();
$$;
revoke all on function public.has_mfa() from public, anon;
grant execute on function public.has_mfa() to authenticated;

create or replace function public.workspace_session()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce((
    select jsonb_build_object(
      'userId',p.id,'email',p.email,'firstName',p.first_name,'lastName',p.last_name,
      'employmentStatus',p.employment_status,'isSystemOwner',p.is_system_owner,
      'active',p.employment_status in ('active','on_leave'),
      'mfaRequired',public.current_user_requires_mfa(),
      'emailMfaVerified',public.has_email_mfa_verification(),
      'authenticatorAssuranceLevel',public.current_authenticator_assurance_level(),
      'roles',case when p.employment_status in ('active','on_leave') then coalesce((
        select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id=p.id
      ),'[]'::jsonb) else '[]'::jsonb end
    ) from public.profiles p where p.id=auth.uid()
  ),jsonb_build_object('active',false,'roles','[]'::jsonb,'mfaRequired',false,'emailMfaVerified',false,'authenticatorAssuranceLevel',public.current_authenticator_assurance_level()));
$$;
revoke all on function public.workspace_session() from public, anon;
grant execute on function public.workspace_session() to authenticated;

comment on function public.has_mfa() is 'Requires an unexpired email OTP verification bound to the current Auth session.';
comment on function public.record_email_mfa_verification(uuid,uuid) is 'Records a server-verified email OTP for one Auth session; executable only with the service role.';
comment on function public.has_any_role(public.app_role[]) is 'Checks active RBAC membership and requires session-bound email OTP verification for privileged roles.';
