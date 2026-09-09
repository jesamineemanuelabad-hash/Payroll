-- Protected system owner, live dashboard reporting, and XGBoost scoring persistence.

alter table public.profiles
  add column if not exists is_payroll_employee boolean not null default true,
  add column if not exists is_system_owner boolean not null default false;

-- The first super administrator is the installation owner. Keep the identity profile
-- for authentication/audit references, but never treat it as a payroll employee.
with first_admin as (
  select user_id
  from public.user_roles
  where role = 'super_admin'::public.app_role
  order by created_at, user_id
  limit 1
)
update public.profiles p
set is_system_owner = true, is_payroll_employee = false
from first_admin a
where p.id = a.user_id;

create unique index if not exists profiles_single_system_owner
  on public.profiles ((is_system_owner)) where is_system_owner;

create or replace function public.protect_system_owner_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_system_owner then
    if tg_op = 'DELETE' then
      raise exception 'The system owner profile cannot be deleted';
    end if;
    if not new.is_system_owner or new.is_payroll_employee or new.employment_status <> 'active' then
      raise exception 'The system owner must remain active and excluded from payroll';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists protect_system_owner_profile on public.profiles;
create trigger protect_system_owner_profile
before update or delete on public.profiles
for each row execute function public.protect_system_owner_profile();

create or replace function public.protect_system_owner_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.role = 'super_admin'::public.app_role
     and exists (select 1 from public.profiles where id = old.user_id and is_system_owner) then
    if tg_op = 'DELETE' or new.role <> 'super_admin'::public.app_role or new.user_id <> old.user_id then
      raise exception 'The system owner super_admin role cannot be removed';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists protect_system_owner_role on public.user_roles;
create trigger protect_system_owner_role
before update or delete on public.user_roles
for each row execute function public.protect_system_owner_role();

create or replace function public.require_payroll_employee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.employee_id and is_payroll_employee and not is_system_owner
  ) then
    raise exception 'System accounts cannot be used as employee records';
  end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'payroll_items','compensation_reviews','claims','employee_benefits',
    'dependents','benefit_enrollments','attendance_records',
    'employee_compensation_history','payroll_adjustments','attendance_predictions'
  ] loop
    execute format('drop trigger if exists require_payroll_employee on public.%I', table_name);
    execute format('create trigger require_payroll_employee before insert or update of employee_id on public.%I for each row execute function public.require_payroll_employee()', table_name);
  end loop;
end $$;

-- Ensure future bootstrap-created owners receive the same protection.
create or replace function public.bootstrap_first_admin(
  p_user_id uuid,
  p_employee_number text,
  p_first_name text,
  p_last_name text,
  p_email text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('payroll:first-admin-bootstrap', 0));
  if exists (select 1 from public.user_roles where role = 'super_admin'::public.app_role) then
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
    id, employee_number, first_name, last_name, email, job_title,
    employment_status, is_payroll_employee, is_system_owner
  ) values (
    p_user_id, upper(btrim(p_employee_number)), btrim(p_first_name),
    btrim(p_last_name), lower(btrim(p_email)), 'System Administrator',
    'active', false, true
  );
  insert into public.user_roles (user_id, role)
  values (p_user_id, 'super_admin'::public.app_role);
end;
$$;
revoke all on function public.bootstrap_first_admin(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_admin(uuid,text,text,text,text) to service_role;

-- Workforce selectors and the Employees workspace must not expose system identities.
create or replace function public.list_records(p_entity text, p_search text default '', p_page integer default 0, p_size integer default 25, p_parent uuid default null, p_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; predicate text; projection text;
begin
  if auth.uid() is null then raise exception 'Sign in to read records' using errcode = '42501'; end if;
  perform public.record_definition(p_entity);
  if p_page < 0 or p_page > 100000 or p_size < 1 or p_size > 1000 or length(p_search) > 200 then raise exception 'Invalid pagination or search' using errcode = '22023'; end if;
  predicate := '($1 = '''' or strpos(lower(to_jsonb(t)::text), lower($1)) > 0) and ($2 is null or t.id = $2)';
  if p_entity = 'payroll_items' then predicate := predicate || ' and ($3 is null or t.payroll_run_id = $3)'; end if;
  if p_entity = 'profiles' then predicate := predicate || ' and t.is_payroll_employee and not t.is_system_owner'; end if;
  projection := 'to_jsonb(t) - ''calculation_snapshot'' - ''is_payroll_employee'' - ''is_system_owner''';
  if p_entity = 'employee_compensation_history' then projection := projection || ' - ''allowances'''; end if;
  execute format('select jsonb_build_object(''rows'', coalesce((select jsonb_agg(r.value) from (select %s as value from public.%I t where %s order by t.created_at desc, t.id limit $4 offset $5) r), ''[]''::jsonb), ''count'', (select count(*) from public.%I t where %s))', projection, p_entity, predicate, p_entity, predicate)
    into result using p_search, p_id, p_parent, p_size, p_page * p_size;
  return result;
end $$;
revoke all on function public.list_records(text,text,integer,integer,uuid,uuid) from public;
grant execute on function public.list_records(text,text,integer,integer,uuid,uuid) to authenticated;

create or replace function public.lookup_records(p_entity text,p_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; predicate text := 'id = any($1)';
begin
  if auth.uid() is null then raise exception 'Sign in to read records' using errcode = '42501'; end if;
  perform public.record_definition(p_entity);
  if cardinality(p_ids) > 100 then raise exception 'Too many lookup IDs'; end if;
  if p_entity = 'profiles' then predicate := predicate || ' and is_payroll_employee and not is_system_owner'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''is_payroll_employee'' - ''is_system_owner''),''[]''::jsonb) from public.%I t where %s',p_entity,predicate)
    into result using p_ids;
  return result;
end $$;
revoke all on function public.lookup_records(text,uuid[]) from public;
grant execute on function public.lookup_records(text,uuid[]) to authenticated;

create or replace function public.dashboard_snapshot(
  p_months integer default 12,
  p_department_id uuid default null,
  p_location text default null,
  p_employment_type text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin','payroll_manager','hr_manager']::public.app_role[]) then
    raise exception 'Your role cannot view organization analytics' using errcode = '42501';
  end if;
  if p_months not in (3,6,12) then raise exception 'Invalid reporting range' using errcode = '22023'; end if;

  with
  base_workforce as (
    select p.* from public.profiles p
    where p.is_payroll_employee and not p.is_system_owner and p.employment_status = 'active'
      and (p_location is null or p.location = p_location)
      and (p_employment_type is null or p.employment_type = p_employment_type)
  ),
  workforce as (
    select * from base_workforce where p_department_id is null or department_id = p_department_id
  ),
  months as (
    select month_start::date,
      to_char(month_start, 'Mon') label
    from generate_series(
      date_trunc('month', current_date) - make_interval(months => p_months - 1),
      date_trunc('month', current_date), interval '1 month'
    ) month_start
  ),
  payroll_trend as (
    select m.month_start, m.label,
      coalesce(sum(i.net_pay) filter (where i.status <> 'excluded'),0) net,
      coalesce(sum(i.gross_pay) filter (where i.status <> 'excluded'),0) gross,
      coalesce(sum(i.benefits) filter (where i.status <> 'excluded'),0) benefits,
      coalesce(sum(i.contributions) filter (where i.status <> 'excluded'),0) contributions,
      coalesce(sum(i.basic_salary) filter (where i.status <> 'excluded'),0) base_salary,
      coalesce(sum(i.allowances) filter (where i.status <> 'excluded'),0) allowances,
      coalesce(sum(i.overtime) filter (where i.status <> 'excluded'),0) overtime
    from months m
    left join public.payroll_runs r on date_trunc('month', r.pay_date) = m.month_start
    left join public.payroll_items i on i.payroll_run_id = r.id and exists(select 1 from workforce w where w.id = i.employee_id)
    group by m.month_start,m.label order by m.month_start
  ),
  latest_run as (
    select r.* from public.payroll_runs r order by r.pay_date desc, r.created_at desc limit 1
  ),
  latest_items as (
    select i.* from public.payroll_items i join latest_run r on r.id=i.payroll_run_id join workforce w on w.id=i.employee_id
  ),
  base_current_comp as (
    select w.id,w.department_id,
      case c.salary_frequency when 'semi_monthly' then c.base_salary*2 when 'daily' then c.base_salary*22 when 'hourly' then c.base_salary*176 else c.base_salary end monthly_salary
    from base_workforce w
    left join lateral (
      select h.base_salary,h.salary_frequency from public.employee_compensation_history h
      where h.employee_id=w.id and h.effective_from <= current_date and (h.effective_to is null or h.effective_to >= current_date)
      order by h.effective_from desc limit 1
    ) c on true
  ),
  current_comp as (
    select c.* from base_current_comp c join workforce w on w.id=c.id
  ),
  latest_model as (
    select m.* from public.attendance_model_runs m where m.status='completed' order by m.completed_at desc nulls last,m.started_at desc limit 1
  ),
  task_values as (
    select
      (select count(*) from latest_items where status='needs_review') payroll,
      (select count(*) from public.claims c join workforce w on w.id=c.employee_id where c.status in ('submitted','under_review') or c.verification_status in ('needs_review','missing_document')) claims,
      (select coalesce(sum(c.amount),0) from public.claims c join workforce w on w.id=c.employee_id where c.status in ('submitted','under_review')) claim_amount,
      (select count(*) from public.employee_benefits b join workforce w on w.id=b.employee_id where b.status='pending' or b.eligibility='pending_documents') benefits,
      (select count(*) from public.attendance_predictions a join latest_model m on m.id=a.model_run_id join workforce w on w.id=a.employee_id where a.anomaly_score>=0.7 and a.reviewed_at is null) anomalies
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'lastSyncAt', (select max(coalesce(completed_at,created_at)) from public.integration_sync_jobs where status in ('completed','completed_with_exceptions')),
    'options', jsonb_build_object(
      'departments', coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) order by d.name) from public.departments d), '[]'::jsonb),
      'locations', coalesce((select jsonb_agg(x.location order by x.location) from (select distinct location from public.profiles where is_payroll_employee and location is not null and btrim(location)<>'' ) x), '[]'::jsonb),
      'employmentTypes', coalesce((select jsonb_agg(x.employment_type order by x.employment_type) from (select distinct employment_type from public.profiles where is_payroll_employee) x), '[]'::jsonb)
    ),
    'summary', jsonb_build_object(
      'employeeCount',(select count(*) from workforce),
      'currentNet',coalesce((select sum(net_pay) from latest_items where status<>'excluded'),0),
      'currentGross',coalesce((select sum(gross_pay) from latest_items where status<>'excluded'),0),
      'currentBenefits',coalesce((select sum(benefits) from latest_items where status<>'excluded'),0),
      'currentContributions',coalesce((select sum(contributions) from latest_items where status<>'excluded'),0),
      'averageCompensation',coalesce((select avg(monthly_salary) from current_comp where monthly_salary is not null),0),
      'openActions',(select payroll+claims+benefits+anomalies from task_values)
    ),
    'trend',coalesce((select jsonb_agg(jsonb_build_object('month',month_start,'label',label,'net',net,'gross',gross,'benefits',benefits,'contributions',contributions,'baseSalary',base_salary,'allowances',allowances,'overtime',overtime) order by month_start) from payroll_trend),'[]'::jsonb),
    'departments',coalesce((
      select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'employees',x.employees,'cost',x.cost) order by x.employees desc,x.name)
      from (
        select d.id,d.name,count(b.id) employees,coalesce(sum(cc.monthly_salary),0) cost
        from public.departments d left join base_workforce b on b.department_id=d.id
        left join base_current_comp cc on cc.id=b.id
        group by d.id,d.name having count(b.id)>0
      ) x
    ),'[]'::jsonb),
    'readiness',(select jsonb_build_object(
      'id',r.id,'periodStart',r.period_start,'periodEnd',r.period_end,'payDate',r.pay_date,'status',r.status,
      'employeeCount',(select count(*) from latest_items where status<>'excluded'),
      'net',coalesce((select sum(net_pay) from latest_items where status<>'excluded'),0),
      'exceptions',(select count(*) from latest_items where status='needs_review'),
      'progress',case r.status when 'draft' then 25 when 'processing' then 50 when 'pending_approval' then 75 when 'approved' then 90 when 'paid' then 100 else 0 end
    ) from latest_run r),
    'tasks',(select jsonb_build_array(
      jsonb_build_object('type','payroll','count',payroll,'amount',0),
      jsonb_build_object('type','claims','count',claims,'amount',claim_amount),
      jsonb_build_object('type','benefits','count',benefits,'amount',0),
      jsonb_build_object('type','attendance','count',anomalies,'amount',0)
    ) from task_values),
    'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select a.id,a.action,a.entity_type "entityType",a.entity_id "entityId",a.created_at,
        coalesce(p.first_name||' '||p.last_name,'System') actor
      from public.audit_logs a left join public.profiles p on p.id=a.user_id
      where a.entity_type in ('profiles','payroll_runs','payroll_items','claims','employee_benefits','attendance_records','compensation_reviews')
      order by a.created_at desc limit 12
    ) x),'[]'::jsonb),
    'attendance',jsonb_build_object(
      'total',(select count(*) from public.attendance_records a join workforce w on w.id=a.employee_id where a.attendance_date >= (current_date-make_interval(months=>p_months))::date),
      'classes',coalesce((select jsonb_agg(jsonb_build_object('classification',x.classification,'count',x.count)) from (
        select a.classification,count(*) count from public.attendance_records a join workforce w on w.id=a.employee_id
        where a.attendance_date >= (current_date-make_interval(months=>p_months))::date group by a.classification order by a.classification
      ) x),'[]'::jsonb),
      'daily',coalesce((select jsonb_agg(jsonb_build_object('date',x.attendance_date,'score',x.score,'total',x.total) order by x.attendance_date) from (
        select a.attendance_date,round(100.0*count(*) filter(where a.classification in ('on_time','overtime'))/nullif(count(*),0),1) score,count(*) total
        from public.attendance_records a join workforce w on w.id=a.employee_id
        where a.attendance_date >= current_date-6 group by a.attendance_date
      ) x),'[]'::jsonb)
    ),
    'model',(select jsonb_build_object('id',m.id,'name',m.model_name,'version',m.model_version,'recordsScored',m.records_scored,'validationAccuracy',m.validation_accuracy,'completedAt',m.completed_at) from latest_model m),
    'anomalies',coalesce((select jsonb_agg(to_jsonb(x) order by x."anomalyScore" desc) from (
      select a.id,p.first_name||' '||p.last_name employee,a.predicted_class "predictedClass",a.class_probability "classProbability",a.anomaly_score "anomalyScore",a.anomaly_reasons "reasons",a.reviewed_at "reviewedAt"
      from public.attendance_predictions a join latest_model m on m.id=a.model_run_id join workforce w on w.id=a.employee_id join public.profiles p on p.id=a.employee_id
      where a.anomaly_score>=0.7 order by a.anomaly_score desc limit 10
    ) x),'[]'::jsonb),
    'compensationBands',jsonb_build_array(
      jsonb_build_object('band','Under ₱30K','employees',(select count(*) from current_comp where monthly_salary<30000)),
      jsonb_build_object('band','₱30K–45K','employees',(select count(*) from current_comp where monthly_salary>=30000 and monthly_salary<45000)),
      jsonb_build_object('band','₱45K–60K','employees',(select count(*) from current_comp where monthly_salary>=45000 and monthly_salary<60000)),
      jsonb_build_object('band','₱60K–80K','employees',(select count(*) from current_comp where monthly_salary>=60000 and monthly_salary<80000)),
      jsonb_build_object('band','₱80K–100K','employees',(select count(*) from current_comp where monthly_salary>=80000 and monthly_salary<100000)),
      jsonb_build_object('band','₱100K–150K','employees',(select count(*) from current_comp where monthly_salary>=100000 and monthly_salary<150000)),
      jsonb_build_object('band','Over ₱150K','employees',(select count(*) from current_comp where monthly_salary>=150000))
    ),
    'costMix',(select jsonb_build_object(
      'baseSalary',coalesce(sum(li.basic_salary) filter(where li.status<>'excluded'),0),
      'allowances',coalesce(sum(li.allowances) filter(where li.status<>'excluded'),0),
      'overtime',coalesce(sum(li.overtime) filter(where li.status<>'excluded'),0),
      'benefits',coalesce(sum(li.benefits) filter(where li.status<>'excluded'),0),
      'contributions',coalesce(sum(li.contributions) filter(where li.status<>'excluded'),0)
    ) from latest_items li),
    'drivers',jsonb_build_object(
      'overtime',coalesce((select sum(overtime) from latest_items where status<>'excluded'),0),
      'claims',coalesce((select sum(c.amount) from public.claims c join workforce w on w.id=c.employee_id where c.status in ('approved','paid') and date_trunc('month',coalesce(c.submitted_at,c.created_at))=date_trunc('month',current_date)),0),
      'newHires',(select count(*) from workforce where hired_at>=current_date-30)
    )
  ) into result;
  return result;
end $$;
revoke all on function public.dashboard_snapshot(integer,uuid,text,text) from public;
grant execute on function public.dashboard_snapshot(integer,uuid,text,text) to authenticated;

create or replace function public.attendance_scoring_features(p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Your role cannot run attendance scoring' using errcode='42501';
  end if;
  if p_to<p_from or p_to-p_from>92 then raise exception 'Invalid scoring period' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'attendanceRecordId',a.id,'employeeId',a.employee_id,
    'scheduledStartMinute',extract(hour from a.scheduled_time_in)::integer*60+extract(minute from a.scheduled_time_in)::integer,
    'actualStartMinute',case when a.time_in is null then null else extract(hour from a.time_in at time zone 'Asia/Manila')::integer*60+extract(minute from a.time_in at time zone 'Asia/Manila')::integer end,
    'workedMinutes',a.worked_minutes,'overtimeMinutes',a.overtime_minutes,
    'rollingLateRate30d',coalesce((select count(*) filter(where h.classification='late')::numeric/nullif(count(*),0) from public.attendance_records h where h.employee_id=a.employee_id and h.attendance_date between a.attendance_date-30 and a.attendance_date-1),0),
    'rollingAbsenceRate30d',coalesce((select count(*) filter(where h.classification='absent')::numeric/nullif(count(*),0) from public.attendance_records h where h.employee_id=a.employee_id and h.attendance_date between a.attendance_date-30 and a.attendance_date-1),0),
    'dayOfWeek',extract(dow from a.attendance_date)::integer,'isHolidayAdjacent',false
  ) order by a.attendance_date,a.employee_id),'[]'::jsonb) into result
  from public.attendance_records a join public.profiles p on p.id=a.employee_id
  where a.attendance_date between p_from and p_to and p.is_payroll_employee and not p.is_system_owner;
  return result;
end $$;
revoke all on function public.attendance_scoring_features(date,date) from public;
grant execute on function public.attendance_scoring_features(date,date) to authenticated;

create or replace function public.save_attendance_predictions(
  p_from date,p_to date,p_model_version text,p_validation_accuracy numeric,p_artifact_reference text,p_predictions jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare run_id uuid; inserted_count integer;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Your role cannot save attendance scoring' using errcode='42501';
  end if;
  if p_to<p_from or jsonb_typeof(p_predictions)<>'array' or jsonb_array_length(p_predictions)>10000
     or nullif(btrim(p_model_version),'') is null or nullif(btrim(p_artifact_reference),'') is null then
    raise exception 'Invalid model result' using errcode='22023';
  end if;
  if p_validation_accuracy is not null and (p_validation_accuracy<0 or p_validation_accuracy>1) then
    raise exception 'Invalid validation accuracy' using errcode='22023';
  end if;
  insert into public.attendance_model_runs(model_version,feature_schema_version,period_start,period_end,records_scored,status,artifact_reference,completed_at,created_by)
  values(p_model_version,'attendance-v1',p_from,p_to,jsonb_array_length(p_predictions),'completed',p_artifact_reference,now(),auth.uid()) returning id into run_id;
  update public.attendance_model_runs set validation_accuracy=p_validation_accuracy where id=run_id;
  insert into public.attendance_predictions(model_run_id,attendance_record_id,employee_id,predicted_class,class_probability,anomaly_score,anomaly_reasons)
  select run_id,a.id,a.employee_id,x.classification::public.attendance_classification,x."classProbability",x."anomalyScore",x."anomalyReasons"
  from jsonb_to_recordset(p_predictions) as x("attendanceRecordId" uuid,classification text,"classProbability" numeric,"anomalyScore" numeric,"anomalyReasons" text[])
  join public.attendance_records a on a.id=x."attendanceRecordId"
  join public.profiles p on p.id=a.employee_id and p.is_payroll_employee and not p.is_system_owner
  where a.attendance_date between p_from and p_to and x.classification in ('on_time','late','absent','overtime')
    and x."classProbability" between 0 and 1 and x."anomalyScore" between 0 and 1;
  get diagnostics inserted_count = row_count;
  if inserted_count<>jsonb_array_length(p_predictions) then raise exception 'Model output did not match the requested attendance records'; end if;
  return run_id;
end $$;
revoke all on function public.save_attendance_predictions(date,date,text,numeric,text,jsonb) from public;
grant execute on function public.save_attendance_predictions(date,date,text,numeric,text,jsonb) to authenticated;

comment on function public.dashboard_snapshot(integer,uuid,text,text) is 'Permission-checked live aggregates for Overview and HR Analytics; system identities are excluded.';
