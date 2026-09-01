-- Safe catalog seed. User-linked sample data is rendered by the typed application fallback
-- until local auth users are created, avoiding brittle direct writes into auth.users.
insert into public.departments (id, name, code) values
  ('10000000-0000-4000-8000-000000000001', 'Engineering', 'ENG'),
  ('10000000-0000-4000-8000-000000000002', 'Product & Design', 'PRD'),
  ('10000000-0000-4000-8000-000000000003', 'People Operations', 'PEO'),
  ('10000000-0000-4000-8000-000000000004', 'Finance', 'FIN'),
  ('10000000-0000-4000-8000-000000000005', 'Sales', 'SAL'),
  ('10000000-0000-4000-8000-000000000006', 'Customer Success', 'CS')
on conflict (id) do update set name = excluded.name, code = excluded.code;

insert into public.benefit_providers (id, name, contact_information, status) values
  ('20000000-0000-4000-8000-000000000001', 'Maxicare', '{"email":"corporate@maxicare.com.ph","phone":"+63 2 8582 1900"}', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'Intellicare', '{"email":"accounts@intellicare.com.ph","phone":"+63 2 8789 4000"}', 'active')
on conflict (id) do update set name = excluded.name, contact_information = excluded.contact_information, status = excluded.status;

insert into public.benefit_plans (id, provider_id, name, description, employee_cost, employer_cost, coverage_type, status) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Platinum Plus', 'Comprehensive inpatient, outpatient, dental, and emergency coverage.', 850.00, 3450.00, 'family', 'active'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Corporate Select', 'Core medical coverage with nationwide accredited providers.', 0.00, 2600.00, 'employee_only', 'active')
on conflict (id) do update set name = excluded.name, description = excluded.description, employee_cost = excluded.employee_cost, employer_cost = excluded.employer_cost, coverage_type = excluded.coverage_type, status = excluded.status;
