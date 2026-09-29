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

update public.email_mfa_send_limits
set last_sent_at=now()-interval '61 seconds';

comment on function public.issue_login_email_otp(uuid,uuid,text) is 'Issues a session-bound 90-second email OTP with a 60-second resend cooldown and no hourly send limit.';
