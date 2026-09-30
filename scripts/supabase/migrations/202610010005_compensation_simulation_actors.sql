alter table public.compensation_reviews
  add column if not exists simulation_submitter text,
  add column if not exists simulation_hr_reviewer text,
  add column if not exists simulation_finance_reviewer text;

alter table public.compensation_reviews
  drop constraint if exists compensation_reviews_simulation_actors_labeled;
alter table public.compensation_reviews
  add constraint compensation_reviews_simulation_actors_labeled
  check (
    (simulation_submitter is null or simulation_submitter like '[Simulation] %')
    and (simulation_hr_reviewer is null or simulation_hr_reviewer like '[Simulation] %')
    and (simulation_finance_reviewer is null or simulation_finance_reviewer like '[Simulation] %')
  );
