create or replace function public.normalize_demo_employee_numbers(p_mappings jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  item jsonb;
  target public.profiles;
  old_number text;
  original_number text;
  new_number text;
  changed integer := 0;
  reference_count integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Only a service-role caller can normalize generated employee numbers' using errcode='42501';
  end if;
  if jsonb_typeof(p_mappings)<>'array' or jsonb_array_length(p_mappings)>98 then
    raise exception 'Invalid employee-number mapping list' using errcode='22023';
  end if;

  for item in select value from jsonb_array_elements(p_mappings)
  loop
    select * into target from public.profiles
    where id=(item->>'id')::uuid for update;
    if not found or target.is_system_owner or not target.is_payroll_employee then
      raise exception 'Employee-number mapping targets an ineligible profile' using errcode='42501';
    end if;
    select u.raw_user_meta_data->>'employee_number' into original_number
    from auth.users u
    where u.id=target.id and u.raw_user_meta_data->>'organization_chart_demo'='true';
    if not found or original_number !~ '^DEMO-ORG-[0-9]{3}$' then
      raise exception 'Employee-number mapping targets an identity not marked as generated' using errcode='42501';
    end if;

    old_number := target.employee_number;
    new_number := btrim(item->>'employeeNumber');
    if new_number !~ '^EMP-[0-9]{6}$' then
      raise exception 'Generated employee number has an invalid format' using errcode='22023';
    end if;
    if old_number<>new_number then
      if old_number<>original_number then
        raise exception 'Refusing to replace an unexpected employee number' using errcode='42501';
      end if;
      update public.profiles set employee_number=new_number where id=target.id;
      changed := changed+1;
    end if;
    update public.attendance_records
    set external_id=replace(external_id,original_number,new_number)
    where employee_id=target.id
      and external_id like 'SAMPLE-ATT-%'
      and strpos(external_id,original_number)>0;
    get diagnostics reference_count = row_count;
    if old_number<>new_number or reference_count>0 then
      insert into public.audit_logs(user_id,action,entity_type,entity_id,old_values,new_values)
      values (
        null,'demo_employee_number_normalized','profiles',target.id::text,
        jsonb_build_object('employee_number',original_number,'sample_attendance_references',reference_count),
        jsonb_build_object('employee_number',new_number,'sample_attendance_references',reference_count,'synthetic_identity',true)
      );
    end if;
  end loop;

  return jsonb_build_object('renumbered',changed);
end;
$$;
revoke all on function public.normalize_demo_employee_numbers(jsonb) from public,anon,authenticated;
grant execute on function public.normalize_demo_employee_numbers(jsonb) to service_role;

create or replace function public.seed_demo_attendance_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  roster_count integer;
  source_count integer;
  generated_count integer;
  present_count integer;
  late_count integer;
  absent_count integer;
  on_leave_count integer;
  overtime_count integer;
  skipped_count integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Only a service-role caller can seed demo attendance' using errcode='42501';
  end if;
  if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month<>date '2026-09-01' then
    raise exception 'This demo seed is limited to September 2026' using errcode='22023';
  end if;

  select count(*)::integer into roster_count
  from public.profiles p
  where p.is_payroll_employee and not p.is_system_owner and p.employment_status='active'
    and lower(p.job_title) not like '%system administrator%'
    and lower(p.job_title) not like '%system admin%'
    and not exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='super_admin');
  if roster_count<>98 then
    raise exception 'Expected 98 active non-administrator payroll employees; found %',roster_count using errcode='22023';
  end if;

  with candidates as (
    select p.id employee_id,p.employee_number,g.day::date attendance_date
    from public.profiles p
    cross join generate_series(p_month,(p_month+interval '1 month'-interval '1 day')::date,interval '1 day') g(day)
    where p.is_payroll_employee and not p.is_system_owner and p.employment_status='active'
      and lower(p.job_title) not like '%system administrator%'
      and lower(p.job_title) not like '%system admin%'
      and not exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='super_admin')
      and extract(isodow from g.day) between 1 and 5
      and not exists (
        select 1 from public.attendance_records a
        where a.employee_id=p.id and a.attendance_date=g.day::date
          and a.external_id not like 'SAMPLE-ATT-%'
      )
  ), ranked as (
    select c.*,
      row_number() over(order by md5(c.employee_id::text||c.attendance_date::text)) as row_number,
      count(*) over() as total
    from candidates c
  ), classified as (
    select r.*,
      round(r.total*0.85)::integer as present_total,
      case
        when r.row_number<=round(r.total*0.80)::integer then 'on_time'::public.attendance_classification
        when r.row_number<=round(r.total*0.83)::integer then 'late'::public.attendance_classification
        when r.row_number<=round(r.total*0.85)::integer then 'overtime'::public.attendance_classification
        else case mod(abs(hashtext(r.employee_id::text||r.attendance_date::text)::bigint),2)
          when 0 then 'absent'::public.attendance_classification
          else 'on_leave'::public.attendance_classification
        end
      end as classification
    from ranked r
  ), inserted as (
    insert into public.attendance_records(
      employee_id,external_id,attendance_date,scheduled_time_in,scheduled_time_out,
      time_in,time_out,worked_minutes,late_minutes,undertime_minutes,overtime_minutes,
      absence_minutes,classification,approved_leave,work_day_type,night_minutes,source_updated_at
    )
    select
      c.employee_id,
      'SAMPLE-ATT-ORG-202609-'||c.employee_number||'-'||to_char(c.attendance_date,'YYYY-MM-DD'),
      c.attendance_date,
      time '09:00',time '18:00',
      case c.classification
        when 'on_time' then (c.attendance_date+time '09:00') at time zone 'Asia/Manila'
        when 'late' then (c.attendance_date+time '09:18') at time zone 'Asia/Manila'
        when 'overtime' then (c.attendance_date+time '09:00') at time zone 'Asia/Manila'
        else null
      end,
      case c.classification
        when 'absent' then null
        when 'on_leave' then null
        when 'overtime' then (c.attendance_date+time '19:00') at time zone 'Asia/Manila'
        else (c.attendance_date+time '18:00') at time zone 'Asia/Manila'
      end,
      case c.classification when 'on_time' then 540 when 'late' then 522 when 'absent' then 0 when 'on_leave' then 0 else 600 end,
      case c.classification when 'late' then 18 else 0 end,
      0,
      case c.classification when 'overtime' then 60 else 0 end,
      case c.classification when 'absent' then 480 else 0 end,
      c.classification,
      false,
      'ordinary',
      0,
      now()
    from classified c
    on conflict(employee_id,attendance_date) do update set
      external_id=excluded.external_id,
      scheduled_time_in=excluded.scheduled_time_in,
      scheduled_time_out=excluded.scheduled_time_out,
      time_in=excluded.time_in,
      time_out=excluded.time_out,
      worked_minutes=excluded.worked_minutes,
      late_minutes=excluded.late_minutes,
      undertime_minutes=excluded.undertime_minutes,
      overtime_minutes=excluded.overtime_minutes,
      absence_minutes=excluded.absence_minutes,
      classification=excluded.classification,
      approved_leave=false,
      work_day_type=excluded.work_day_type,
      night_minutes=excluded.night_minutes,
      source_updated_at=excluded.source_updated_at
    where public.attendance_records.external_id like 'SAMPLE-ATT-%'
    returning classification
  )
  select
    count(*)::integer,
    count(*) filter(where classification in ('on_time','late','overtime'))::integer,
    count(*) filter(where classification='late')::integer,
    count(*) filter(where classification='absent')::integer,
    count(*) filter(where classification='on_leave')::integer,
    count(*) filter(where classification='overtime')::integer
  into generated_count,present_count,late_count,absent_count,on_leave_count,overtime_count
  from inserted;

  select count(*)::integer into source_count
  from public.profiles p
  cross join generate_series(p_month,(p_month+interval '1 month'-interval '1 day')::date,interval '1 day') g(day)
  where p.is_payroll_employee and not p.is_system_owner and p.employment_status='active'
    and lower(p.job_title) not like '%system administrator%'
    and lower(p.job_title) not like '%system admin%'
    and not exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='super_admin')
    and extract(isodow from g.day) between 1 and 5;
  skipped_count := source_count-generated_count;

  return jsonb_build_object(
    'month','2026-09','employees',roster_count,'workingDays',22,
    'generatedEmployeeDays',generated_count,'present',present_count,'late',late_count,
    'absent',absent_count,'onLeave',on_leave_count,'overtime',overtime_count,
    'untouchedExistingAttendance',skipped_count
  );
end;
$$;
revoke all on function public.seed_demo_attendance_month(date) from public,anon,authenticated;
grant execute on function public.seed_demo_attendance_month(date) to service_role;
