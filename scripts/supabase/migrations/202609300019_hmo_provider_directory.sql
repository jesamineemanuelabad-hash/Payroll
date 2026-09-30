insert into public.benefit_providers(name)
select provider.name
from (values ('Maxicare'),('Intellicare'),('iCare')) as provider(name)
where not exists (
  select 1
  from public.benefit_providers existing
  where lower(existing.name)=lower(provider.name)
);

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
      'employerSharePercent',p.employer_share_percent
    ) from public.hmo_policy p where p.id=true),
    'packages',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'tier',t.tier,'providerId',t.provider_id,'providerName',bp.name,
      'annualPremium',t.annual_premium,'coverageDetails',t.coverage_details,'active',t.active,
      'salaryMin',t.salary_min,'salaryMax',t.salary_max,'pricingBasis',t.pricing_basis
    ) order by case t.tier when 'Executive' then 1 when 'Premium' then 2 when 'Standard Plus' then 3 else 4 end)
      from public.hmo_package_tiers t left join public.benefit_providers bp on bp.id=t.provider_id),'[]'::jsonb),
    'providers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',provider.id,
      'name',provider.name,
      'status',provider.status,
      'packageTiers',coalesce((
        select jsonb_agg(t.tier order by case t.tier when 'Executive' then 1 when 'Premium' then 2 when 'Standard Plus' then 3 else 4 end)
        from public.hmo_package_tiers t
        where t.provider_id=provider.id and t.active
      ),'[]'::jsonb)
    ) order by provider.name)
      from public.benefit_providers provider),'[]'::jsonb),
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
      'enrollmentId',enrollment.id,'packageId',enrollment.package_id,'status',enrollment.status,
      'membershipNumber',enrollment.membership_number,'effectiveDate',enrollment.effective_date,
      'expirationDate',enrollment.expiration_date,'notes',enrollment.notes
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
      left join public.hmo_enrollments enrollment on enrollment.employee_id=employee.id
      where not employee.is_system_owner
        and lower(employee.job_title) not like '%system admin%'
        and not exists(select 1 from public.user_roles ur where ur.user_id=employee.id and ur.role='super_admin')),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.hmo_benefits_snapshot() from public,anon;
grant execute on function public.hmo_benefits_snapshot() to authenticated;
