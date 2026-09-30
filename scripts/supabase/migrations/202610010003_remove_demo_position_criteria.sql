delete from public.job_position_credential_criteria
where notes like 'Demo suggestion;%';

drop function if exists public.seed_demo_credentials();
