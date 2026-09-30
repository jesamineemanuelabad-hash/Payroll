alter table public.hmo_policy
  alter column annual_employer_allocation drop not null;

update public.hmo_policy
set annual_employer_allocation = null,
    updated_at = now()
where id = true;
