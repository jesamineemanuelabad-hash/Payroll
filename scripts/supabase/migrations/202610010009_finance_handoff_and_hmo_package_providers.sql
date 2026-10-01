create or replace function public.enforce_finance_handoff_boundary()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_table_name='claims'
    and (
      (old.status::text='finance_approval' and new.status::text in ('approved','rejected','paid'))
      or (old.status::text='approved' and new.status::text='paid')
    ) then
    raise exception 'Finance approval and disbursement are handled outside this system';
  end if;

  if tg_table_name='compensation_reviews'
    and (
      (old.status::text='finance_review' and new.status::text in ('approved','rejected'))
      or (old.status::text='approved' and new.status::text='implemented')
    ) then
    raise exception 'Finance approval and implementation are handled outside this system';
  end if;

  if tg_table_name='payroll_runs'
    and (
      (old.status::text='pending_approval' and new.status::text='approved')
      or (old.status::text='approved' and new.status::text='paid')
    ) then
    raise exception 'Finance approval and disbursement are handled outside this system';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_finance_handoff_boundary() from public,anon,authenticated;

create trigger claims_finance_handoff_boundary
before update of status on public.claims
for each row execute function public.enforce_finance_handoff_boundary();

create trigger compensation_finance_handoff_boundary
before update of status on public.compensation_reviews
for each row execute function public.enforce_finance_handoff_boundary();

create trigger payroll_finance_handoff_boundary
before update of status on public.payroll_runs
for each row execute function public.enforce_finance_handoff_boundary();

create or replace function public.save_hmo_package_provider(p_package_id uuid,p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare old_provider_id uuid;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Only HR administrators can update HMO package providers' using errcode='42501';
  end if;

  select provider_id into old_provider_id
  from public.hmo_package_tiers
  where id=p_package_id and active
  for update;
  if not found then raise exception 'Active HMO package tier not found' using errcode='P0002'; end if;

  if p_provider_id is not null and not exists (
    select 1 from public.benefit_providers
    where id=p_provider_id and status='active'
  ) then
    raise exception 'Select an active provider from the provider directory' using errcode='23514';
  end if;

  if old_provider_id is distinct from p_provider_id then
    update public.hmo_package_tiers
    set provider_id=p_provider_id,updated_at=clock_timestamp()
    where id=p_package_id;

    insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
    values (
      auth.uid(),'update','hmo_package_tiers',p_package_id::text,
      jsonb_build_object('provider_id',old_provider_id),
      jsonb_build_object('provider_id',p_provider_id)
    );
  end if;
end;
$$;

revoke all on function public.save_hmo_package_provider(uuid,uuid) from public,anon;
grant execute on function public.save_hmo_package_provider(uuid,uuid) to authenticated;
