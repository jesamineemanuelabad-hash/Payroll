-- Automatically claim scoring only when the last 30 days of attendance changed.
-- A singleton lease prevents concurrent dashboard visits from starting duplicate jobs.
create table public.attendance_scoring_state (
  id boolean primary key default true check (id),
  lease_token uuid,
  lease_until timestamptz,
  claimed_at timestamptz,
  last_input_updated_at timestamptz,
  claimed_input_updated_at timestamptz,
  next_attempt_at timestamptz,
  last_completed_at timestamptz
);
insert into public.attendance_scoring_state(id) values(true);
alter table public.attendance_scoring_state enable row level security;
revoke all on public.attendance_scoring_state from public,anon,authenticated;

create function public.claim_automatic_attendance_scoring()
returns jsonb language plpgsql security definer set search_path='' as $$
declare state public.attendance_scoring_state; input_updated timestamptz; input_count bigint; token uuid;
begin
  if not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Your role cannot run attendance scoring' using errcode='42501';
  end if;
  select * into state from public.attendance_scoring_state where id=true for update;
  if state.lease_until>now() then return jsonb_build_object('status','busy'); end if;
  if state.next_attempt_at>now() then return jsonb_build_object('status','retry_later'); end if;

  select count(*),max(a.updated_at) into input_count,input_updated
  from public.attendance_records a join public.profiles p on p.id=a.employee_id
  where a.attendance_date between current_date-30 and current_date
    and p.is_payroll_employee and not p.is_system_owner;
  if input_count=0 then
    update public.attendance_scoring_state set next_attempt_at=now()+interval '1 hour' where id=true;
    return jsonb_build_object('status','no_data');
  end if;
  if state.last_completed_at is not null and input_updated<=state.last_input_updated_at
     and state.last_completed_at>now()-interval '1 day' then
    return jsonb_build_object('status','up_to_date');
  end if;
  token:=gen_random_uuid();
  update public.attendance_scoring_state
  set lease_token=token,lease_until=now()+interval '10 minutes',claimed_at=now(),claimed_input_updated_at=input_updated,next_attempt_at=null
  where id=true;
  return jsonb_build_object('status','claimed','token',token);
end $$;
revoke all on function public.claim_automatic_attendance_scoring() from public,anon;
grant execute on function public.claim_automatic_attendance_scoring() to authenticated;

create function public.finish_automatic_attendance_scoring(p_token uuid,p_success boolean,p_model_run_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare state public.attendance_scoring_state;
begin
  if not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Your role cannot finish attendance scoring' using errcode='42501';
  end if;
  select * into state from public.attendance_scoring_state where id=true for update;
  if state.lease_token is distinct from p_token or state.lease_until<=now() then return false; end if;
  if p_success and not exists(
    select 1 from public.attendance_model_runs m
    where m.id=p_model_run_id and m.created_by=auth.uid() and m.status='completed'
      and m.started_at>=state.claimed_at and m.records_scored>0
  ) then raise exception 'A completed model run is required before finishing scoring' using errcode='22023'; end if;
  update public.attendance_scoring_state set
    last_input_updated_at=case when p_success then claimed_input_updated_at else last_input_updated_at end,
    last_completed_at=case when p_success then now() else last_completed_at end,
    next_attempt_at=case when p_success then null else now()+interval '15 minutes' end,
    claimed_at=null,claimed_input_updated_at=null,lease_token=null,lease_until=null where id=true;
  return true;
end $$;
revoke all on function public.finish_automatic_attendance_scoring(uuid,boolean,uuid) from public,anon;
grant execute on function public.finish_automatic_attendance_scoring(uuid,boolean,uuid) to authenticated;
