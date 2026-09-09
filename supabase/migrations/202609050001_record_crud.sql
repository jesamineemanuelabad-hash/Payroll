-- Persistent record management. Apply after both existing migrations.
alter table public.employee_compensation_history add column updated_at timestamptz not null default now();
create trigger set_compensation_history_updated_at before update on public.employee_compensation_history for each row execute function public.set_updated_at();
alter table public.benefit_plans add column benefit_type text not null default 'HMO' check (benefit_type in ('HMO','Allowance','Insurance','Leave','Government'));
alter table public.employee_benefits add column eligibility text not null default 'pending_documents' check (eligibility in ('pending_documents','eligible','not_eligible'));
alter table public.payroll_items add column attendance_adjustments numeric(12,2) not null default 0;
alter table public.payroll_items add column benefits numeric(12,2) not null default 0 check (benefits >= 0);
alter table public.payroll_items add column reimbursements numeric(12,2) not null default 0 check (reimbursements >= 0);
alter table public.payroll_items alter column status set default 'needs_review';
alter table public.attendance_records alter column source_updated_at set default now();
alter table public.attendance_records add constraint attendance_time_order check (time_out is null or (time_in is not null and time_out >= time_in));

-- Qualify the outer ID: the old unqualified name referred to payroll_items.id.
drop policy "users read permitted payroll runs" on public.payroll_runs;
create policy "users read permitted payroll runs" on public.payroll_runs for select to authenticated using (
  public.has_any_role(array['super_admin','hr_admin','payroll_manager']::public.app_role[])
  or exists (select 1 from public.payroll_items item where item.payroll_run_id = payroll_runs.id and public.can_access_employee(item.employee_id))
);
-- Approval decisions must go through the checked mutation below.
drop policy "employees create own claims" on public.claims;
drop policy "employees edit own draft claims" on public.claims;
create policy "employees create own draft claims" on public.claims for insert to authenticated with check (employee_id = auth.uid() and status = 'draft' and approver_id is null and verification_status = 'pending');
create policy "employees edit own draft claims" on public.claims for update to authenticated using (employee_id = auth.uid() and status = 'draft') with check (employee_id = auth.uid() and status in ('draft','submitted') and approver_id is null and verification_status = 'pending');

-- Application users can read through RLS, but cannot bypass mutation validation.
revoke insert, update, delete on public.departments, public.profiles, public.attendance_records,
  public.compensation_cycles, public.compensation_reviews, public.employee_compensation_history,
  public.benefit_providers, public.benefit_plans, public.employee_benefits,
  public.claims, public.payroll_runs, public.payroll_items from authenticated, anon;

create function public.record_definition(entity text) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare fields text; roles text := 'super_admin,hr_admin';
begin
  case entity
    when 'departments' then fields := 'name,code';
    when 'profiles' then fields := 'employee_number,first_name,last_name,email,department_id,job_title,location,employment_status,hired_at';
    when 'attendance_records' then
      fields := 'employee_id,external_id,attendance_date,time_in,time_out,worked_minutes,late_minutes,undertime_minutes,overtime_minutes,absence_minutes,classification,approved_leave'; roles := 'super_admin,hr_admin,payroll_manager';
    when 'compensation_cycles' then fields := 'name,starts_on,ends_on,budget,status'; roles := 'super_admin,hr_admin,hr_manager';
    when 'compensation_reviews' then fields := 'employee_id,cycle_id,current_salary,proposed_salary,bonus,justification,status'; roles := 'super_admin,hr_admin,hr_manager';
    when 'employee_compensation_history' then fields := 'employee_id,base_salary,salary_frequency,effective_from,effective_to'; roles := 'super_admin,hr_admin,hr_manager';
    when 'benefit_providers' then fields := 'name,status';
    when 'benefit_plans' then fields := 'provider_id,name,description,benefit_type,employee_cost,employer_cost,coverage_type,status';
    when 'employee_benefits' then fields := 'employee_id,plan_id,membership_number,effective_date,expiration_date,eligibility,status';
    when 'claims' then fields := 'employee_id,claim_number,category,description,amount,receipt_url,verification_status,status,rejection_reason'; roles := 'super_admin,hr_admin,hr_manager';
    when 'payroll_runs' then fields := 'period_start,period_end,pay_date'; roles := 'super_admin,payroll_manager';
    when 'payroll_items' then fields := 'payroll_run_id,employee_id,basic_salary,allowances,overtime,attendance_adjustments,benefits,reimbursements,deductions,contributions,status'; roles := 'super_admin,payroll_manager';
    else raise exception 'Unknown record type' using errcode = '22023';
  end case;
  return jsonb_build_object('fields', to_jsonb(string_to_array(fields, ',')), 'roles', to_jsonb(string_to_array(roles, ',')));
end $$;
revoke all on function public.record_definition(text) from public;
grant execute on function public.record_definition(text) to authenticated;

create function public.record_roles() returns text[] language sql stable security invoker set search_path = '' as $$
  select coalesce(array_agg(role::text), array[]::text[]) from public.user_roles where user_id = auth.uid();
$$;
revoke all on function public.record_roles() from public;
grant execute on function public.record_roles() to authenticated;

create function public.list_records(p_entity text, p_search text default '', p_page integer default 0, p_size integer default 25, p_parent uuid default null, p_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; predicate text; projection text;
begin
  if auth.uid() is null then raise exception 'Sign in to read records' using errcode = '42501'; end if;
  perform public.record_definition(p_entity);
  if p_page < 0 or p_page > 100000 or p_size < 1 or p_size > 1000 or length(p_search) > 200 then raise exception 'Invalid pagination or search' using errcode = '22023'; end if;
  predicate := '($1 = '''' or strpos(lower(to_jsonb(t)::text), lower($1)) > 0) and ($2 is null or t.id = $2)';
  if p_entity = 'payroll_items' then predicate := predicate || ' and ($3 is null or t.payroll_run_id = $3)'; end if;
  -- Snapshot JSON is not needed by the record editor.
  projection := 'to_jsonb(t) - ''calculation_snapshot'' - ''allowances''';
  if p_entity <> 'employee_compensation_history' then projection := 'to_jsonb(t) - ''calculation_snapshot'''; end if;
  execute format('select jsonb_build_object(''rows'', coalesce((select jsonb_agg(r.value) from (select %s as value from public.%I t where %s order by t.created_at desc, t.id limit $4 offset $5) r), ''[]''::jsonb), ''count'', (select count(*) from public.%I t where %s))', projection, p_entity, predicate, p_entity, predicate)
    into result using p_search, p_id, p_parent, p_size, p_page * p_size;
  return result;
end $$;
revoke all on function public.list_records(text,text,integer,integer,uuid,uuid) from public;
grant execute on function public.list_records(text,text,integer,integer,uuid,uuid) to authenticated;

create function public.lookup_records(p_entity text,p_ids uuid[]) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to read records' using errcode = '42501'; end if;
  perform public.record_definition(p_entity);
  if cardinality(p_ids) > 100 then raise exception 'Too many lookup IDs'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where id = any($1)',p_entity) into result using p_ids;
  return result;
end $$;
revoke all on function public.lookup_records(text,uuid[]) from public;
grant execute on function public.lookup_records(text,uuid[]) to authenticated;

create function public.audit_record_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
  values ((select id from public.profiles where id = auth.uid()), lower(tg_op), tg_table_name,
    coalesce(new.id,old.id)::text, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new,old);
end $$;
revoke all on function public.audit_record_change() from public;
do $$ declare t text; begin
  foreach t in array array['departments','profiles','attendance_records','compensation_cycles','compensation_reviews','employee_compensation_history','benefit_providers','benefit_plans','employee_benefits','claims','payroll_runs','payroll_items'] loop
    execute format('create trigger audit_record after insert or update or delete on public.%I for each row execute function public.audit_record_change()',t);
  end loop;
end $$;

-- Serialize changes through the parent run, and protect historical payroll.
create function public.guard_payroll_item() returns trigger language plpgsql set search_path = '' as $$
declare run_status public.payroll_status;
begin
  select status into run_status from public.payroll_runs where id = case when tg_op = 'DELETE' then old.payroll_run_id else new.payroll_run_id end for update;
  if run_status is distinct from 'draft'::public.payroll_status then raise exception 'Only draft payroll entries can be changed'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'UPDATE' and new.payroll_run_id <> old.payroll_run_id then raise exception 'Cannot move an entry to another run'; end if;
  new.gross_pay := new.basic_salary + new.allowances + new.overtime + new.attendance_adjustments + new.benefits + new.reimbursements;
  new.net_pay := new.gross_pay - new.deductions;
  if new.net_pay < 0 then raise exception 'Deductions exceed gross earnings'; end if;
  return new;
end $$;
create trigger guard_payroll_item before insert or update or delete on public.payroll_items for each row execute function public.guard_payroll_item();

create function public.refresh_payroll_totals() returns trigger language plpgsql security definer set search_path = '' as $$
declare run_id uuid := coalesce(new.payroll_run_id,old.payroll_run_id);
begin
  update public.payroll_runs set employee_count = x.n, total_gross = x.gross, total_deductions = x.deductions, total_contributions = x.contributions, total_net = x.net
  from (select count(*)::integer n, coalesce(sum(gross_pay),0) gross, coalesce(sum(deductions),0) deductions, coalesce(sum(contributions),0) contributions, coalesce(sum(net_pay),0) net
    from public.payroll_items where payroll_run_id = run_id and status <> 'excluded') x where id = run_id;
  return coalesce(new,old);
end $$;
revoke all on function public.refresh_payroll_totals() from public;
create trigger refresh_payroll_totals after insert or update or delete on public.payroll_items for each row execute function public.refresh_payroll_totals();

create function public.mutate_record(p_entity text, p_operation text, p_data jsonb default '{}'::jsonb, p_id uuid default null, p_version timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  definition jsonb; allowed text[]; required_roles public.app_role[]; key text; columns_sql text; values_sql text; assignments_sql text;
  previous jsonb; next_row jsonb; saved jsonb; target_id uuid; parent_id uuid; parent_status public.payroll_status; approving boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to change records' using errcode = '42501'; end if;
  definition := public.record_definition(p_entity);
  select array_agg(value::public.app_role) into required_roles from jsonb_array_elements_text(definition->'roles');
  if not public.has_any_role(required_roles) then raise exception 'Your role cannot change these records' using errcode = '42501'; end if;
  if p_operation not in ('create','update','delete') or jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid operation'; end if;
  select array_agg(value) into allowed from jsonb_array_elements_text(definition->'fields');
  if p_entity = 'profiles' and p_operation = 'create' then allowed := allowed || 'id'::text; end if;
  for key in select jsonb_object_keys(p_data) loop
    if not key = any(allowed) then raise exception 'Field % cannot be changed', key; end if;
  end loop;

  if p_operation <> 'create' then
    if p_id is null or p_version is null then raise exception 'Record ID and version are required'; end if;
    -- Lock parent before child to avoid concurrent aggregate races/deadlocks.
    if p_entity = 'payroll_items' then
      select payroll_run_id into parent_id from public.payroll_items where id = p_id;
      perform 1 from public.payroll_runs where id = parent_id for update;
    end if;
    execute format('select to_jsonb(t) from public.%I t where id = $1 for update', p_entity) into previous using p_id;
    if previous is null then raise exception 'Record no longer exists' using errcode = 'P0002'; end if;
    if (previous->>'updated_at')::timestamptz <> p_version then raise exception 'This record changed. Refresh and review the latest version before saving.' using errcode = '40001'; end if;
    if p_entity = 'payroll_runs' and previous->>'status' <> 'draft' then raise exception 'Only draft runs can be edited or deleted'; end if;
    if p_entity = 'claims' and (previous->>'status' in ('approved','paid') or previous->>'included_payroll_run_id' is not null) then raise exception 'Approved or payroll-linked claims are read-only'; end if;
    if p_entity = 'compensation_reviews' and (previous->>'status' = 'approved' or previous->>'applied_at' is not null) then raise exception 'Approved compensation reviews are read-only'; end if;
    if p_entity = 'employee_benefits' and previous->>'applied_payroll_run_id' is not null then raise exception 'Payroll-linked benefits are read-only'; end if;
    if p_entity = 'profiles' and p_id = auth.uid() and (p_operation = 'delete' or p_data->>'employment_status' = 'terminated') then raise exception 'You cannot delete or terminate your own profile'; end if;
  end if;
  if p_operation = 'delete' then
    if p_entity = 'compensation_cycles' and exists(select 1 from public.compensation_reviews where cycle_id = p_id) then raise exception 'Remove draft proposals before deleting a cycle. Cycles with retained reviews cannot be deleted.'; end if;
    if p_entity in ('claims','compensation_reviews') and previous->>'status' <> 'draft' then raise exception 'Only drafts can be deleted'; end if;
    if p_entity = 'payroll_runs' and exists(select 1 from public.payroll_items where payroll_run_id = p_id) then raise exception 'Delete the draft employee entries before deleting the run'; end if;
    execute format('delete from public.%I where id = $1 returning to_jsonb(%I.*)',p_entity,p_entity) into saved using p_id;
    return saved;
  end if;

  next_row := coalesce(previous,'{}'::jsonb) || p_data;
  if p_entity in ('claims','compensation_reviews') then
    if p_operation = 'update' and previous->>'status' <> 'draft' and next_row->>'employee_id' is distinct from previous->>'employee_id' then raise exception 'Cannot reassign a submitted record'; end if;
    if p_operation = 'create' and next_row->>'status' <> 'draft' then raise exception 'New records must start as draft'; end if;
    if p_entity = 'claims' and next_row->>'status' not in ('draft','submitted','under_review','approved','rejected') then raise exception 'Invalid claim status'; end if;
    approving := next_row->>'status' in ('approved','rejected') and next_row->>'status' is distinct from previous->>'status';
    if approving and previous->>'status' not in ('submitted','under_review') then raise exception 'Submit the record before an approval decision'; end if;
    if approving and (next_row->>'employee_id')::uuid = auth.uid() then raise exception 'You cannot approve or reject your own record'; end if;
    if p_entity = 'compensation_reviews' then
      if approving and previous->>'submitted_by' = auth.uid()::text then raise exception 'A different reviewer must make the approval decision'; end if;
      p_data := p_data || jsonb_build_object('increase_percentage',case when (next_row->>'current_salary')::numeric = 0 then 0 else round(((next_row->>'proposed_salary')::numeric / (next_row->>'current_salary')::numeric - 1)*100,3) end);
      if next_row->>'status' = 'submitted' and previous->>'status' is distinct from 'submitted' then p_data := p_data || jsonb_build_object('submitted_by',auth.uid()); end if;
      if approving then p_data := p_data || jsonb_build_object('approved_by',auth.uid()); end if;
    else
      if next_row->>'receipt_url' is not null and next_row->>'receipt_url' !~ '^https://' then raise exception 'Document URL must use HTTPS'; end if;
      if next_row->>'verification_status' = 'verified' and nullif(next_row->>'receipt_url','') is null then raise exception 'Supporting document required'; end if;
      if next_row->>'status' = 'approved' and next_row->>'verification_status' <> 'verified' then raise exception 'Verify the supporting document before approval'; end if;
      if next_row->>'verification_status' = 'verified' and (next_row->>'employee_id')::uuid = auth.uid() then raise exception 'A different reviewer must verify your claim'; end if;
      if next_row->>'verification_status' = 'verified' and (previous->>'verification_status' is distinct from 'verified' or previous->>'receipt_url' is distinct from next_row->>'receipt_url') then p_data := p_data || jsonb_build_object('verified_by',auth.uid(),'verified_at',now()); end if;
      if next_row->>'verification_status' <> 'verified' then p_data := p_data || jsonb_build_object('verified_by',null,'verified_at',null); end if;
      if next_row->>'status' = 'submitted' and previous->>'submitted_at' is null then p_data := p_data || jsonb_build_object('submitted_at',now()); end if;
      if approving then p_data := p_data || jsonb_build_object('approver_id',auth.uid()); end if;
    end if;
  end if;
  if p_entity = 'employee_benefits' and next_row->>'status' = 'active' and next_row->>'eligibility' <> 'eligible' then raise exception 'Review eligibility before activating coverage'; end if;
  if p_entity = 'employee_compensation_history' then
    -- Serialize effective-date checks for the same employee.
    perform 1 from public.profiles where id = (next_row->>'employee_id')::uuid for update;
    if exists(select 1 from public.employee_compensation_history where employee_id = (next_row->>'employee_id')::uuid and id <> coalesce(p_id,'00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(effective_from,effective_to,'[]') && daterange((next_row->>'effective_from')::date,(next_row->>'effective_to')::date,'[]')) then raise exception 'Salary effective dates overlap an existing record'; end if;
    if p_operation = 'create' then p_data := p_data || '{"source":"manual"}'::jsonb; end if;
  end if;
  if p_entity = 'payroll_items' then
    parent_id := (next_row->>'payroll_run_id')::uuid;
    select status into parent_status from public.payroll_runs where id = parent_id for update;
    if parent_status is distinct from 'draft'::public.payroll_status then raise exception 'Only draft payroll entries can be changed'; end if;
  end if;
  if p_operation = 'create' then
    if p_entity in ('payroll_runs','compensation_cycles') then p_data := p_data || jsonb_build_object('created_by',auth.uid()); end if;
    if p_entity = 'payroll_runs' then p_data := p_data || '{"status":"draft"}'::jsonb; end if;
    target_id := case when p_entity = 'profiles' then (p_data->>'id')::uuid else gen_random_uuid() end;
    if target_id is null then raise exception 'An existing Auth user ID is required'; end if;
    p_data := p_data || jsonb_build_object('id',target_id);
    select string_agg(format('%I',k),',') into columns_sql from jsonb_object_keys(p_data) k;
    select string_agg(format('r.%I',k),',') into values_sql from jsonb_object_keys(p_data) k;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',p_entity,columns_sql,values_sql,p_entity,p_entity) into saved using p_data;
  else
    p_data := p_data || jsonb_build_object('updated_at',clock_timestamp());
    select string_agg(format('%I = r.%I',k,k),',') into assignments_sql from jsonb_object_keys(p_data) k;
    execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id = $2 returning to_jsonb(t.*)',p_entity,assignments_sql,p_entity) into saved using p_data,p_id;
  end if;
  return saved;
end $$;
revoke all on function public.mutate_record(text,text,jsonb,uuid,timestamptz) from public;
grant execute on function public.mutate_record(text,text,jsonb,uuid,timestamptz) to authenticated;

create function public.record_history(p_entity text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare required_roles public.app_role[]; result jsonb;
begin
  select array_agg(value::public.app_role) into required_roles from jsonb_array_elements_text(public.record_definition(p_entity)->'roles');
  if auth.uid() is null or not public.has_any_role(required_roles) then raise exception 'Not authorized to read this audit history' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into result from (select id,action,user_id,created_at,old_values,new_values from public.audit_logs where entity_type = p_entity and entity_id = p_id::text order by id desc limit 100) a;
  return result;
end $$;
revoke all on function public.record_history(text,uuid) from public;
grant execute on function public.record_history(text,uuid) to authenticated;
