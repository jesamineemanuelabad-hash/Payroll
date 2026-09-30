alter table public.hmo_policy
  drop column annual_employer_allocation,
  add column employer_share_percent numeric(5,2) not null default 100
    check (employer_share_percent between 0 and 100);

alter table public.hmo_package_tiers
  add column salary_min numeric(12,2) not null default 0 check (salary_min >= 0),
  add column salary_max numeric(12,2) check (salary_max is null or salary_max >= salary_min),
  add column pricing_basis text not null default 'planning_estimate'
    check (pricing_basis in ('planning_estimate','provider_quote'));

update public.hmo_package_tiers
set salary_min = case tier
      when 'Standard' then 0
      when 'Standard Plus' then 30000
      when 'Premium' then 60000
      else 120000
    end,
    salary_max = case tier
      when 'Standard' then 29999.99
      when 'Standard Plus' then 59999.99
      when 'Premium' then 119999.99
      else null
    end,
    annual_premium = case tier
      when 'Standard' then 6000
      when 'Standard Plus' then 12000
      when 'Premium' then 24000
      else 36000
    end,
    pricing_basis = 'planning_estimate',
    updated_at = now();

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
      'eligibilityRule',p.eligibility_rule,
      'effectiveFrom',p.effective_from,
      'employerSharePercent',p.employer_share_percent,
      'projectedAnnualEmployerBudget',coalesce((
        select sum(t.annual_premium*p.employer_share_percent/100)
        from public.profiles employee
        join lateral (
          select history.base_salary
          from public.employee_compensation_history history
          where history.employee_id=employee.id
            and history.effective_from<=current_date
            and (history.effective_to is null or history.effective_to>=current_date)
          order by history.effective_from desc
          limit 1
        ) salary on true
        join public.hmo_package_tiers t
          on salary.base_salary>=t.salary_min
          and (t.salary_max is null or salary.base_salary<=t.salary_max)
          and t.active
        where employee.employment_status='active'
          and employee.is_payroll_employee
          and not employee.is_system_owner
          and lower(employee.job_title) not like '%system admin%'
          and not exists(select 1 from public.user_roles ur where ur.user_id=employee.id and ur.role='super_admin')
      ),0)
    ) from public.hmo_policy p where p.id=true),
    'packages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'tier',t.tier,'providerId',t.provider_id,'providerName',bp.name,
      'annualPremium',t.annual_premium,'coverageDetails',t.coverage_details,'active',t.active,
      'salaryMin',t.salary_min,'salaryMax',t.salary_max,'pricingBasis',t.pricing_basis
    ) order by case t.tier when 'Executive' then 1 when 'Premium' then 2 when 'Standard Plus' then 3 else 4 end)
      from public.hmo_package_tiers t left join public.benefit_providers bp on bp.id=t.provider_id),'[]'::jsonb),
    'employees',coalesce((select jsonb_agg(jsonb_build_object(
      'id',employee.id,'employeeNumber',employee.employee_number,
      'name',concat_ws(' ',employee.first_name,employee.last_name),
      'departmentName',d.name,
      'currentMonthlySalary',salary.base_salary,
      'recommendedPackageId',recommended.id,
      'eligible',employee.employment_status='active'
        and employee.is_payroll_employee
        and not employee.is_system_owner
        and salary.base_salary is not null
        and recommended.id is not null,
      'eligibilityReason',case
        when employee.is_system_owner then 'System owner is excluded'
        when not employee.is_payroll_employee then 'Not enrolled in payroll'
        when employee.employment_status<>'active' then 'Employment status is not active'
        when salary.base_salary is null then 'No current effective salary record'
        when recommended.id is null then 'Salary is outside configured HMO tiers'
        else concat('Salary qualifies for the ',recommended.tier,' tier')
      end,
      'enrollmentId',e.id,'packageId',e.package_id,'status',e.status,
      'membershipNumber',e.membership_number,'effectiveDate',e.effective_date,
      'expirationDate',e.expiration_date,'notes',e.notes
    ) order by employee.employee_number)
      from public.profiles employee
      left join public.departments d on d.id=employee.department_id
      left join lateral (
        select history.base_salary
        from public.employee_compensation_history history
        where history.employee_id=employee.id
          and history.effective_from<=current_date
          and (history.effective_to is null or history.effective_to>=current_date)
        order by history.effective_from desc
        limit 1
      ) salary on true
      left join public.hmo_package_tiers recommended
        on salary.base_salary>=recommended.salary_min
        and (recommended.salary_max is null or salary.base_salary<=recommended.salary_max)
        and recommended.active
      left join public.hmo_enrollments e on e.employee_id=employee.id
      where not employee.is_system_owner
        and lower(employee.job_title) not like '%system admin%'
        and not exists(select 1 from public.user_roles ur where ur.user_id=employee.id and ur.role='super_admin')),'[]'::jsonb)
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
    select 1
    from public.profiles employee
    join lateral (
      select history.base_salary
      from public.employee_compensation_history history
      where history.employee_id=employee.id
        and history.effective_from<=current_date
        and (history.effective_to is null or history.effective_to>=current_date)
      order by history.effective_from desc
      limit 1
    ) salary on true
    join public.hmo_package_tiers t
      on t.id=p_package_id
      and t.active
      and salary.base_salary>=t.salary_min
      and (t.salary_max is null or salary.base_salary<=t.salary_max)
    where employee.id=p_employee_id
      and employee.is_payroll_employee
      and not employee.is_system_owner
      and employee.employment_status='active'
      and lower(employee.job_title) not like '%system admin%'
      and not exists(select 1 from public.user_roles ur where ur.user_id=employee.id and ur.role='super_admin')
  ) then
    raise exception 'Employee is not eligible for the selected salary-based HMO tier' using errcode='22023';
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
