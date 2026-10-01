create table public.hr_analytics_access_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (user_id, session_id),
  constraint hr_analytics_access_window_valid check (expires_at > verified_at)
);

alter table public.hr_analytics_access_grants enable row level security;
revoke all on table public.hr_analytics_access_grants from public, anon, authenticated;
grant all on table public.hr_analytics_access_grants to service_role;

create or replace function public.has_hr_analytics_access()
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.hr_analytics_access_grants g
      where g.user_id = auth.uid()
        and g.session_id = (auth.jwt()->>'session_id')::uuid
        and g.expires_at > now()
    )
$$;

revoke all on function public.has_hr_analytics_access() from public, anon;
grant execute on function public.has_hr_analytics_access() to authenticated;

alter function public.hr_analytics_snapshot(integer,uuid,text,text) rename to hr_analytics_snapshot_unlocked;
revoke all on function public.hr_analytics_snapshot_unlocked(integer,uuid,text,text) from public, anon, authenticated;

create function public.hr_analytics_snapshot(
  p_months integer default 12,
  p_department_id uuid default null,
  p_location text default null,
  p_employment_type text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_hr_analytics_access() then
    raise exception 'HR Analytics requires password verification' using errcode = '42501';
  end if;
  return public.hr_analytics_snapshot_unlocked(p_months,p_department_id,p_location,p_employment_type);
end $$;

revoke all on function public.hr_analytics_snapshot(integer,uuid,text,text) from public, anon;
grant execute on function public.hr_analytics_snapshot(integer,uuid,text,text) to authenticated;
comment on function public.hr_analytics_snapshot(integer,uuid,text,text) is
  'Password-gated, session-bound HR workforce aggregates; access grants expire after 15 minutes.';
