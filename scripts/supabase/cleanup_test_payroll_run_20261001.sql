-- One-time cleanup for the October 1-15 test payroll run.
-- Review the run and independently confirm no payment was disbursed before running.
-- This is a manual SQL Editor script, not a migration.

begin;

do $$
declare
  target_run_id constant uuid := '41f9a22d-8e55-438e-aaa1-22e4b6ee873d';
  target_run public.payroll_runs%rowtype;
  entry_count integer;
  entries_with_worked_days integer;
  attendance_count integer;
  deleted_entries integer;
  deleted_runs integer;
begin
  select *
  into target_run
  from public.payroll_runs
  where id = target_run_id
  for update;

  if not found then
    raise exception 'Aborting: the specified October test payroll run was not found.';
  end if;

  if target_run.period_start <> date '2026-10-01'
    or target_run.period_end <> date '2026-10-15'
    or target_run.pay_date <> date '2026-10-20'
    or target_run.status <> 'paid'::public.payroll_status
    or target_run.total_gross <> 2527000.00
    or target_run.total_net <> 2095771.77 then
    raise exception 'Aborting: the payroll run does not match the expected October test record.';
  end if;

  select count(*)::integer,
    count(*) filter (where worked_days <> 0)::integer
  into entry_count, entries_with_worked_days
  from public.payroll_items
  where payroll_run_id = target_run_id;

  if entry_count <> 98 or entries_with_worked_days <> 0 then
    raise exception 'Aborting: expected 98 payroll entries with zero worked days; found % entries and % entries with worked days.',
      entry_count, entries_with_worked_days;
  end if;

  select count(*)::integer
  into attendance_count
  from public.attendance_records a
  join public.payroll_items i on i.employee_id = a.employee_id
  where i.payroll_run_id = target_run_id
    and a.attendance_date between target_run.period_start and target_run.period_end;

  if attendance_count <> 0 then
    raise exception 'Aborting: found % attendance records for employees in this payroll period.',
      attendance_count;
  end if;

  -- The regular UI protects finalized runs. This narrowly scoped cleanup first
  -- moves only the verified test run to draft so its guarded entries can be removed.
  update public.payroll_runs
  set status = 'draft'
  where id = target_run_id;

  delete from public.payroll_items
  where payroll_run_id = target_run_id;
  get diagnostics deleted_entries = row_count;

  if deleted_entries <> 98 then
    raise exception 'Aborting: expected to remove 98 entries, removed %.', deleted_entries;
  end if;

  delete from public.payroll_runs
  where id = target_run_id;
  get diagnostics deleted_runs = row_count;

  if deleted_runs <> 1 then
    raise exception 'Aborting: expected to remove exactly one payroll run, removed %.', deleted_runs;
  end if;

  raise notice 'Removed October test payroll run % and % calculated entries. Employee, salary-history, and attendance source records were not deleted.',
    target_run_id, deleted_entries;
end
$$;

commit;
