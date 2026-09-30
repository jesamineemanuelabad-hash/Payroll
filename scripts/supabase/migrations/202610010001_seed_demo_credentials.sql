-- Seed credential matrix: position-level qualification criteria and employee-held credentials.
-- This migration adds a service-role-only function that populates both
-- job_position_credential_criteria and employee_credentials in a single atomic call,
-- using the logged-in admin profile as the created_by value.
-- Apply 202610010002_credentials_record_workflows.sql before invoking the
-- seed function. The follow-up migration replaces this intermediate function
-- with an idempotent criteria-only seed that never fabricates employee credentials.

create or replace function public.seed_demo_credentials()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_pos_id uuid;
  v_emp record;
  rows_added integer;
  criteria_count integer := 0;
  credential_count integer := 0;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Only a service-role caller can seed demo credentials' using errcode = '42501';
  end if;

  -- Pick first super_admin or hr_admin as the created_by author
  select ur.user_id into v_admin_id
  from public.user_roles ur
  where ur.role in ('super_admin', 'hr_admin')
  limit 1;

  if v_admin_id is null then
    -- Fallback: use the first system owner
    select p.id into v_admin_id
    from public.profiles p
    where p.is_system_owner
    limit 1;
  end if;

  if v_admin_id is null then
    raise exception 'No admin profile found to use as created_by. Create a user first.' using errcode = '23503';
  end if;

  -- ────────────────────────────────────────────────────────────────────────────
  -- 1. POSITION CREDENTIAL CRITERIA
  --    For each department + title combination, insert required/preferred creds
  -- ────────────────────────────────────────────────────────────────────────────

  -- Engineering positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'ENG' and lower(jp.title) like '%senior%'
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'AWS Certified Solutions Architect', 'preferred', 'Cloud infrastructure proficiency', v_admin_id),
      (v_pos_id, 'Professional Scrum Master (PSM I)', 'preferred', 'Agile methodology certification', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
    get diagnostics rows_added = row_count;
    criteria_count := criteria_count + rows_added;
  end loop;

  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'ENG' and lower(jp.title) like '%lead%'
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'AWS Certified Solutions Architect', 'required', 'Must demonstrate cloud architecture competency', v_admin_id),
      (v_pos_id, 'Professional Scrum Master (PSM I)', 'required', 'Team leads must hold agile certification', v_admin_id),
      (v_pos_id, 'Certified Kubernetes Administrator', 'preferred', 'Container orchestration proficiency', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'ENG' and lower(jp.title) like '%junior%'
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'CompTIA A+ Certification', 'preferred', 'Foundational IT skills', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'ENG' and (lower(jp.title) like '%devops%' or lower(jp.title) like '%infrastructure%' or lower(jp.title) like '%platform%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'AWS Certified Solutions Architect', 'required', 'Core cloud platform credential', v_admin_id),
      (v_pos_id, 'Certified Kubernetes Administrator', 'required', 'Container orchestration is central to role', v_admin_id),
      (v_pos_id, 'HashiCorp Certified Terraform Associate', 'preferred', 'Infrastructure-as-code proficiency', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- QA / Testing positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'ENG' and (lower(jp.title) like '%qa%' or lower(jp.title) like '%quality%' or lower(jp.title) like '%test%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'ISTQB Certified Tester', 'required', 'International software testing qualification', v_admin_id),
      (v_pos_id, 'Certified Agile Tester', 'preferred', 'Agile QA methodology', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- Finance positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'FIN'
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Certified Public Accountant (CPA)', 'required', 'Philippine CPA license for finance roles', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'FIN' and (lower(jp.title) like '%senior%' or lower(jp.title) like '%manager%' or lower(jp.title) like '%lead%' or lower(jp.title) like '%head%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Certified Management Accountant (CMA)', 'preferred', 'Advanced management accounting credential', v_admin_id),
      (v_pos_id, 'Certified Internal Auditor (CIA)', 'preferred', 'Internal audit competency', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- People Operations / HR positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'PEO'
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'CHRP – Certified Human Resource Professional', 'preferred', 'HR professional certification', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'PEO' and (lower(jp.title) like '%senior%' or lower(jp.title) like '%manager%' or lower(jp.title) like '%lead%' or lower(jp.title) like '%head%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'CHRP – Certified Human Resource Professional', 'required', 'Required for senior HR roles', v_admin_id),
      (v_pos_id, 'SHRM-CP Certification', 'preferred', 'International HR credential', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- Sales positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'SAL' and (lower(jp.title) like '%senior%' or lower(jp.title) like '%manager%' or lower(jp.title) like '%lead%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Certified Professional Sales Person (CPSP)', 'preferred', 'Sales methodology certification', v_admin_id),
      (v_pos_id, 'HubSpot Sales Software Certification', 'preferred', 'CRM and sales tooling proficiency', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- Customer Success positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'CS' and (lower(jp.title) like '%senior%' or lower(jp.title) like '%manager%' or lower(jp.title) like '%lead%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Certified Customer Success Manager (CCSM)', 'preferred', 'Customer success methodology', v_admin_id),
      (v_pos_id, 'ITIL Foundation Certificate', 'preferred', 'IT service management best practices', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- Product & Design positions
  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'PRD'
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Certified Scrum Product Owner (CSPO)', 'preferred', 'Agile product ownership', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  for v_pos_id in
    select jp.id from public.job_positions jp
    join public.departments d on d.id = jp.department_id
    where d.code = 'PRD' and (lower(jp.title) like '%ux%' or lower(jp.title) like '%designer%' or lower(jp.title) like '%design%')
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Google UX Design Certificate', 'preferred', 'UX design methodology certification', v_admin_id),
      (v_pos_id, 'Nielsen Norman UX Certification', 'preferred', 'User research and usability expertise', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  -- All remaining positions with no criteria yet: occupational safety
  for v_pos_id in
    select jp.id from public.job_positions jp
    where not exists (
      select 1 from public.job_position_credential_criteria c where c.job_position_id = jp.id
    )
  loop
    insert into public.job_position_credential_criteria (job_position_id, credential_name, criterion_type, notes, created_by)
    values
      (v_pos_id, 'Occupational Safety and Health (OSH) Training', 'required', 'DOLE-mandated basic occupational safety training', v_admin_id)
    on conflict (job_position_id, lower(btrim(credential_name))) do nothing;
  end loop;

  select count(*)::integer into criteria_count from public.job_position_credential_criteria;

  -- ────────────────────────────────────────────────────────────────────────────
  -- 2. EMPLOYEE CREDENTIALS
  --    Give roughly 70% of employees verified credentials that match their
  --    position's criteria, and sprinkle in some pending/expired ones.
  -- ────────────────────────────────────────────────────────────────────────────

  -- Give all employees OSH training (verified for most, pending for a few)
  for v_emp in
    select p.id as employee_id,
           row_number() over (order by p.employee_number) as rn,
           count(*) over () as total
    from public.profiles p
    where p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
      and lower(p.job_title) not like '%system admin%'
  loop
    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'Occupational Safety and Health (OSH) Training',
      'Department of Labor and Employment (DOLE)',
      '2025-03-15'::date,
      '2027-03-15'::date,
      case when v_emp.rn <= round(v_emp.total * 0.85) then 'verified' else 'pending' end,
      case when v_emp.rn <= round(v_emp.total * 0.85) then 'Verified during onboarding' else 'Awaiting document submission' end,
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;
  end loop;

  -- Engineering employees: AWS, PSM, CKA, ISTQB, etc.
  for v_emp in
    select p.id as employee_id, p.job_title,
           row_number() over (order by p.employee_number) as rn,
           count(*) over () as total
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code = 'ENG'
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
      and lower(p.job_title) not like '%system admin%'
  loop
    -- Senior/Lead engineers get AWS cert
    if lower(v_emp.job_title) like '%senior%' or lower(v_emp.job_title) like '%lead%'
       or lower(v_emp.job_title) like '%devops%' or lower(v_emp.job_title) like '%platform%'
       or lower(v_emp.job_title) like '%infrastructure%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'AWS Certified Solutions Architect',
        'Amazon Web Services',
        '2024-08-20'::date,
        '2027-08-20'::date,
        case when v_emp.rn <= round(v_emp.total * 0.75) then 'verified' else 'pending' end,
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;

    -- Leads get PSM
    if lower(v_emp.job_title) like '%lead%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'Professional Scrum Master (PSM I)',
        'Scrum.org',
        '2024-05-10'::date,
        null,  -- PSM doesn't expire
        'verified',
        'Lifetime certification',
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;

    -- DevOps get CKA
    if lower(v_emp.job_title) like '%devops%' or lower(v_emp.job_title) like '%platform%' or lower(v_emp.job_title) like '%infrastructure%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'Certified Kubernetes Administrator',
        'Cloud Native Computing Foundation (CNCF)',
        '2025-01-12'::date,
        '2028-01-12'::date,
        case when v_emp.rn % 3 <> 0 then 'verified' else 'pending' end,
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;

    -- QA roles get ISTQB
    if lower(v_emp.job_title) like '%qa%' or lower(v_emp.job_title) like '%quality%' or lower(v_emp.job_title) like '%test%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'ISTQB Certified Tester',
        'International Software Testing Qualifications Board',
        '2024-11-05'::date,
        null,
        case when v_emp.rn % 4 <> 0 then 'verified' else 'pending' end,
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;

    -- Junior engineers: some have CompTIA
    if lower(v_emp.job_title) like '%junior%' and v_emp.rn % 2 = 0 then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'CompTIA A+ Certification',
        'CompTIA',
        '2025-06-01'::date,
        '2028-06-01'::date,
        'verified',
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;
  end loop;

  -- Finance employees: CPA
  for v_emp in
    select p.id as employee_id, p.job_title,
           row_number() over (order by p.employee_number) as rn,
           count(*) over () as total
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code = 'FIN'
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
  loop
    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'Certified Public Accountant (CPA)',
      'Professional Regulation Commission (PRC)',
      '2020-10-15'::date,
      '2027-10-15'::date,
      case when v_emp.rn <= round(v_emp.total * 0.80) then 'verified' else 'pending' end,
      case when v_emp.rn <= round(v_emp.total * 0.80) then 'PRC license verified' else 'Renewal documentation pending' end,
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;

    -- Senior finance: CMA
    if lower(v_emp.job_title) like '%senior%' or lower(v_emp.job_title) like '%manager%'
       or lower(v_emp.job_title) like '%lead%' or lower(v_emp.job_title) like '%head%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'Certified Management Accountant (CMA)',
        'Institute of Management Accountants (IMA)',
        '2022-04-20'::date,
        '2028-04-20'::date,
        case when v_emp.rn % 2 = 0 then 'verified' else 'pending' end,
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;
  end loop;

  -- People Operations / HR employees: CHRP
  for v_emp in
    select p.id as employee_id, p.job_title,
           row_number() over (order by p.employee_number) as rn,
           count(*) over () as total
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code = 'PEO'
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
  loop
    -- All HR staff: CHRP
    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'CHRP – Certified Human Resource Professional',
      'Philippine Society for Training and Development',
      '2023-07-10'::date,
      '2026-07-10'::date,
      case when v_emp.rn <= round(v_emp.total * 0.70) then 'verified'
           when v_emp.rn <= round(v_emp.total * 0.90) then 'pending'
           else 'rejected' end,
      case when v_emp.rn > round(v_emp.total * 0.90) then 'Document expired – needs renewal' else null end,
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;

    -- Senior HR: SHRM-CP
    if lower(v_emp.job_title) like '%senior%' or lower(v_emp.job_title) like '%manager%'
       or lower(v_emp.job_title) like '%lead%' or lower(v_emp.job_title) like '%head%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'SHRM-CP Certification',
        'Society for Human Resource Management',
        '2024-01-18'::date,
        '2027-01-18'::date,
        case when v_emp.rn % 2 = 0 then 'verified' else 'pending' end,
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;
  end loop;

  -- Sales employees
  for v_emp in
    select p.id as employee_id, p.job_title,
           row_number() over (order by p.employee_number) as rn
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code = 'SAL'
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
      and (lower(p.job_title) like '%senior%' or lower(p.job_title) like '%manager%' or lower(p.job_title) like '%lead%')
  loop
    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'Certified Professional Sales Person (CPSP)',
      'National Association of Sales Professionals',
      '2024-09-01'::date,
      '2027-09-01'::date,
      case when v_emp.rn % 3 <> 0 then 'verified' else 'pending' end,
      null,
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;

    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'HubSpot Sales Software Certification',
      'HubSpot Academy',
      '2025-02-14'::date,
      '2027-02-14'::date,
      'verified',
      'Completed online',
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;
  end loop;

  -- Customer Success employees
  for v_emp in
    select p.id as employee_id, p.job_title,
           row_number() over (order by p.employee_number) as rn
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code = 'CS'
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
      and (lower(p.job_title) like '%senior%' or lower(p.job_title) like '%manager%' or lower(p.job_title) like '%lead%')
  loop
    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'ITIL Foundation Certificate',
      'AXELOS / PeopleCert',
      '2023-11-20'::date,
      null,
      'verified',
      'Foundation-level does not expire',
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;
  end loop;

  -- Product & Design employees
  for v_emp in
    select p.id as employee_id, p.job_title,
           row_number() over (order by p.employee_number) as rn,
           count(*) over () as total
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code = 'PRD'
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
  loop
    -- All product people: CSPO
    if v_emp.rn <= round(v_emp.total * 0.60) then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'Certified Scrum Product Owner (CSPO)',
        'Scrum Alliance',
        '2024-03-15'::date,
        '2026-03-15'::date,
        'verified',
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;

    -- Design roles: Google UX cert
    if lower(v_emp.job_title) like '%ux%' or lower(v_emp.job_title) like '%designer%' or lower(v_emp.job_title) like '%design%' then
      insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
      values (
        v_emp.employee_id,
        'Google UX Design Certificate',
        'Google / Coursera',
        '2025-05-10'::date,
        null,
        case when v_emp.rn % 3 <> 0 then 'verified' else 'pending' end,
        null,
        v_admin_id
      )
      on conflict do nothing;
      credential_count := credential_count + 1;
    end if;
  end loop;

  -- Add a few expired credentials to show realistic data
  for v_emp in
    select p.id as employee_id
    from public.profiles p
    join public.departments d on d.id = p.department_id
    where d.code in ('ENG', 'FIN')
      and p.is_payroll_employee and not p.is_system_owner
      and p.employment_status = 'active'
      and lower(p.job_title) not like '%system admin%'
    order by p.employee_number
    limit 5
  loop
    insert into public.employee_credentials (employee_id, credential_name, issuing_organization, earned_on, expires_on, verification_status, notes, created_by)
    values (
      v_emp.employee_id,
      'First Aid and CPR Training',
      'Philippine Red Cross',
      '2023-01-10'::date,
      '2025-01-10'::date,
      'verified',
      'Certificate expired – renewal scheduled',
      v_admin_id
    )
    on conflict do nothing;
    credential_count := credential_count + 1;
  end loop;

  select count(*)::integer into criteria_count from public.job_position_credential_criteria;
  select count(*)::integer into credential_count from public.employee_credentials;

  return jsonb_build_object(
    'positionCriteria', criteria_count,
    'employeeCredentials', credential_count
  );
end;
$$;

revoke all on function public.seed_demo_credentials() from public, anon, authenticated;
grant execute on function public.seed_demo_credentials() to service_role;
