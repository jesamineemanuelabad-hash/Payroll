-- Store short-lived custom email codes and verify them atomically.
create table public.email_mfa_challenges (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  code_hash text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  failed_attempts smallint not null default 0,
  consumed_at timestamptz,
  primary key (user_id, session_id),
  constraint email_mfa_challenge_hash check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint email_mfa_challenge_attempts check (failed_attempts between 0 and 5),
  constraint email_mfa_challenge_expiry check (expires_at > issued_at)
);

alter table public.email_mfa_challenges enable row level security;
revoke all on table public.email_mfa_challenges from public, anon, authenticated;
grant all on table public.email_mfa_challenges to service_role;
create index email_mfa_challenges_expiry_idx on public.email_mfa_challenges(expires_at);

create table public.email_mfa_send_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  last_sent_at timestamptz not null,
  sends_in_window smallint not null default 1,
  constraint email_mfa_send_limit_count check (sends_in_window between 1 and 5)
);

alter table public.email_mfa_send_limits enable row level security;
revoke all on table public.email_mfa_send_limits from public, anon, authenticated;
grant all on table public.email_mfa_send_limits to service_role;

create or replace function public.issue_login_email_otp(
  p_user_id uuid,
  p_session_id uuid,
  p_code_hash text
)
returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_last_sent_at timestamptz;
begin
  if p_user_id is null or p_session_id is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid email code request.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select last_sent_at
  into v_last_sent_at
  from public.email_mfa_send_limits
  where user_id=p_user_id
  for update;

  if v_last_sent_at is not null and v_last_sent_at > now() - interval '60 seconds' then
    return 'cooldown';
  end if;
  insert into public.email_mfa_send_limits(user_id,window_started_at,last_sent_at,sends_in_window)
  values (p_user_id,now(),now(),1)
  on conflict (user_id) do update
    set window_started_at=now(),
        last_sent_at=now(),
        sends_in_window=1;

  delete from public.email_mfa_challenges where expires_at <= now();
  insert into public.email_mfa_challenges(user_id,session_id,code_hash,issued_at,expires_at)
  values (p_user_id,p_session_id,p_code_hash,now(),now()+interval '90 seconds')
  on conflict (user_id,session_id) do update
    set code_hash=excluded.code_hash,
        issued_at=excluded.issued_at,
        expires_at=excluded.expires_at,
        failed_attempts=0,
        consumed_at=null;
  return 'issued';
end;
$$;
revoke all on function public.issue_login_email_otp(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.issue_login_email_otp(uuid,uuid,text) to service_role;

create or replace function public.verify_login_email_otp(
  p_user_id uuid,
  p_session_id uuid,
  p_code_hash text
)
returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_challenge public.email_mfa_challenges%rowtype;
begin
  if p_user_id is null or p_session_id is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_session_id::text, 0));
  select * into v_challenge
  from public.email_mfa_challenges
  where user_id=p_user_id and session_id=p_session_id
  for update;

  if not found then return 'invalid'; end if;
  if v_challenge.consumed_at is not null then return 'invalid'; end if;
  if v_challenge.expires_at <= now() then return 'expired'; end if;
  if v_challenge.failed_attempts >= 5 then return 'locked'; end if;

  if v_challenge.code_hash <> p_code_hash then
    update public.email_mfa_challenges
    set failed_attempts=failed_attempts+1
    where user_id=p_user_id and session_id=p_session_id;
    return 'invalid';
  end if;

  update public.email_mfa_challenges
  set consumed_at=now()
  where user_id=p_user_id and session_id=p_session_id;

  insert into public.email_mfa_verifications(user_id,session_id,verified_at,expires_at)
  values (p_user_id,p_session_id,now(),now()+interval '12 hours')
  on conflict (user_id,session_id) do update
    set verified_at=excluded.verified_at,expires_at=excluded.expires_at;
  return 'verified';
end;
$$;
revoke all on function public.verify_login_email_otp(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.verify_login_email_otp(uuid,uuid,text) to service_role;

create or replace function public.invalidate_login_email_otp(p_user_id uuid, p_session_id uuid, p_code_hash text)
returns void
language sql security definer set search_path=''
as $$
  delete from public.email_mfa_challenges
  where user_id=p_user_id and session_id=p_session_id and code_hash=p_code_hash and consumed_at is null;
$$;
revoke all on function public.invalidate_login_email_otp(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.invalidate_login_email_otp(uuid,uuid,text) to service_role;

comment on function public.issue_login_email_otp(uuid,uuid,text) is 'Issues a session-bound 90-second email OTP with a 60-second resend cooldown.';
comment on function public.verify_login_email_otp(uuid,uuid,text) is 'Atomically consumes a valid session-bound email OTP after at most five attempts and records the MFA proof.';
