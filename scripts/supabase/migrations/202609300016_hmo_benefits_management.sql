create table public.hmo_policy (
  id boolean primary key default true check (id),
  annual_employer_allocation numeric(12,2) not null check (annual_employer_allocation >= 0),
  eligibility_rule text not null check (eligibility_rule = 'active_payroll_employee'),
  effective_from date not null,
  updated_at timestamptz not null default now()
);

insert into public.hmo_policy(id,annual_employer_allocation,eligibility_rule,effective_from)
values (true,6500,'active_payroll_employee',date '2026-09-30')
on conflict (id) do nothing;

create table public.hmo_package_tiers (
  id uuid primary key default gen_random_uuid(),
  tier text not null unique check (tier in ('Executive','Premium','Standard Plus','Standard')),
  provider_id uuid references public.benefit_providers(id) on delete restrict,
  annual_premium numeric(12,2) check (annual_premium is null or annual_premium >= 0),
  coverage_details text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.hmo_package_tiers(tier)
values ('Executive'),('Premium'),('Standard Plus'),('Standard')
on conflict (tier) do nothing;

create table public.hmo_enrollments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  package_id uuid not null references public.hmo_package_tiers(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','active','waived','terminated')),
  membership_number text,
  effective_date date,
  expiration_date date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id),
  constraint hmo_enrollment_dates_valid check (expiration_date is null or effective_date is null or expiration_date >= effective_date),
  constraint hmo_active_enrollment_dates check (status <> 'active' or effective_date is not null)
);

create index hmo_enrollments_package_status_idx on public.hmo_enrollments(package_id,status);
create trigger set_hmo_enrollments_updated_at before update on public.hmo_enrollments
for each row execute function public.set_updated_at();

alter table public.hmo_policy enable row level security;
alter table public.hmo_package_tiers enable row level security;
alter table public.hmo_enrollments enable row level security;
grant select on public.hmo_policy,public.hmo_package_tiers,public.hmo_enrollments to authenticated;
grant all on public.hmo_policy,public.hmo_package_tiers,public.hmo_enrollments to service_role;

create policy "authenticated users read hmo policy" on public.hmo_policy
for select to authenticated using (true);
create policy "authenticated users read hmo packages" on public.hmo_package_tiers
for select to authenticated using (true);
create policy "users read permitted hmo enrollments" on public.hmo_enrollments
for select to authenticated using (public.can_access_employee(employee_id));

create or replace function public.hmo_benefits_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Only HR administrators can view HMO management' using errcode='42501';
  end if;

  select jsonb_build_object(
    'policy',(select jsonb_build_object(
      'annualEmployerAllocation',p.annual_employer_allocation,
      'eligibilityRule',p.eligibility_rule,
      'effectiveFrom',p.effective_from
    ) from public.hmo_policy p where p.id=true),
    'packages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'tier',t.tier,'providerId',t.provider_id,'providerName',bp.name,
      'annualPremium',t.annual_premium,'coverageDetails',t.coverage_details,'active',t.active
    ) order by case t.tier when 'Executive' then 1 when 'Premium' then 2 when 'Standard Plus' then 3 else 4 end)
      from public.hmo_package_tiers t left join public.benefit_providers bp on bp.id=t.provider_id),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'employeeNumber',p.employee_number,
      'name',concat_ws(' ',p.first_name,p.last_name),
      'departmentName',d.name,
      'eligible',p.employment_status='active' and p.is_payroll_employee and not p.is_system_owner,
      'eligibilityReason',case
        when p.is_system_owner then 'System owner is excluded'
        when not p.is_payroll_employee then 'Not enrolled in payroll'
        when p.employment_status<>'active' then 'Employment status is not active'
        else 'Active payroll employee'
      end,
      'enrollmentId',e.id,'packageId',e.package_id,'status',e.status,
      'membershipNumber',e.membership_number,'effectiveDate',e.effective_date,
      'expirationDate',e.expiration_date,'notes',e.notes
    ) order by p.employee_number)
      from public.profiles p
      left join public.departments d on d.id=p.department_id
      left join public.hmo_enrollments e on e.employee_id=p.id
      where not p.is_system_owner and lower(p.job_title) not like '%system admin%'
        and not exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='super_admin')),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.hmo_benefits_snapshot() from public,anon;
grant execute on function public.hmo_benefits_snapshot() to authenticated;

create or replace function public.save_hmo_enrollment(
  p_employee_id uuid,
  p_package_id uuid,
  p_status text,
  p_membership_number text,
  p_effective_date date,
  p_expiration_date date,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare saved public.hmo_enrollments;
begin
  if auth.uid() is null or not public.has_any_role(array['super_admin','hr_admin']::public.app_role[]) then
    raise exception 'Only HR administrators can manage HMO enrollments' using errcode='42501';
  end if;
  if p_status not in ('pending','active','waived','terminated')
    or (p_membership_number is not null and length(p_membership_number)>100)
    or (p_notes is not null and length(p_notes)>2000)
    or (p_expiration_date is not null and p_effective_date is not null and p_expiration_date<p_effective_date) then
    raise exception 'Invalid HMO enrollment details' using errcode='22023';
  end if;
  if p_status='active' and p_effective_date is null then
    raise exception 'An effective date is required for active coverage' using errcode='22023';
  end if;
  if not exists(select 1 from public.hmo_package_tiers t where t.id=p_package_id and t.active) then
    raise exception 'Selected HMO package is unavailable' using errcode='23503';
  end if;
  if p_status in ('pending','active') and not exists(
    select 1 from public.profiles p
    where p.id=p_employee_id and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status='active'
      and lower(p.job_title) not like '%system admin%'
      and not exists(select 1 from public.user_roles ur where ur.user_id=p.id and ur.role='super_admin')
  ) then
    raise exception 'Only active payroll employees are eligible for HMO enrollment' using errcode='22023';
  end if;

  insert into public.hmo_enrollments(
    employee_id,package_id,status,membership_number,effective_date,expiration_date,notes,created_by,updated_by
  ) values (
    p_employee_id,p_package_id,p_status,nullif(btrim(p_membership_number),''),p_effective_date,p_expiration_date,
    nullif(btrim(p_notes),''),auth.uid(),auth.uid()
  )
  on conflict(employee_id) do update set
    package_id=excluded.package_id,status=excluded.status,
    membership_number=excluded.membership_number,effective_date=excluded.effective_date,
    expiration_date=excluded.expiration_date,notes=excluded.notes,updated_by=auth.uid()
  returning * into saved;

  insert into public.audit_logs(user_id,action,entity_type,entity_id,new_values)
  values(auth.uid(),'hmo_enrollment_updated','hmo_enrollments',saved.id::text,to_jsonb(saved));
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_hmo_enrollment(uuid,uuid,text,text,date,date,text) from public,anon;
grant execute on function public.save_hmo_enrollment(uuid,uuid,text,text,date,date,text) to authenticated;
