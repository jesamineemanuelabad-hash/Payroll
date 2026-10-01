do $migration$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values ('claim-receipts','claim-receipts',false,5242880,array['application/pdf','image/jpeg','image/png'])
    on conflict (id) do update
      set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];

    execute 'drop policy if exists "HR manages claim receipt objects" on storage.objects';
    execute $policy$
      create policy "HR manages claim receipt objects" on storage.objects
      for all to authenticated
      using (bucket_id='claim-receipts' and public.has_any_role(array['super_admin','hr_admin','hr_manager','payroll_manager']::public.app_role[]))
      with check (bucket_id='claim-receipts' and public.has_any_role(array['super_admin','hr_admin','hr_manager','payroll_manager']::public.app_role[]))
    $policy$;
  end if;
end
$migration$;

create or replace function public.apply_hmo_payroll_estimate()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  item record;
begin
  if pg_trigger_depth()>1
     or new.calculated_at is null
     or new.status<>'draft' then
    return new;
  end if;

  for item in
    select i.id,
      i.benefit_employer_contribution,
      i.contributions,
      coalesce((i.calculation_snapshot->>'hmoEmployerCost')::numeric,0) previous_hmo_cost,
      coalesce(hmo.cost,0) hmo_cost,
      hmo.pricing_basis,
      hmo.tier
    from public.payroll_items i
    left join lateral (
      select round(t.annual_premium*policy.employer_share_percent/100
        /case when new.schedule='monthly' then 12 else 24 end,2) cost,
        t.pricing_basis,t.tier
      from public.hmo_enrollments enrollment
      join public.hmo_package_tiers t on t.id=enrollment.package_id and t.active
      join public.hmo_policy policy on policy.id=true and policy.effective_from<=new.period_end
      where enrollment.employee_id=i.employee_id
        and enrollment.status='active'
        and enrollment.effective_date<=new.period_end
        and (enrollment.expiration_date is null or enrollment.expiration_date>=new.period_start)
      limit 1
    ) hmo on true
    where i.payroll_run_id=new.id
  loop
    update public.payroll_items
    set benefit_employer_contribution=greatest(0,item.benefit_employer_contribution-item.previous_hmo_cost)+item.hmo_cost,
        calculation_snapshot=coalesce(calculation_snapshot,'{}'::jsonb)||jsonb_build_object(
          'hmoEmployerCost',item.hmo_cost,
          'hmoPricingBasis',item.pricing_basis,
          'hmoPackage',item.tier
        )
    where id=item.id;
  end loop;

  update public.payroll_runs
  set calculated_at=new.calculated_at,rule_version=new.rule_version
  where id=new.id and (calculated_at is null or rule_version is null);

  return new;
end;
$$;

revoke all on function public.apply_hmo_payroll_estimate() from public,anon,authenticated;
drop trigger if exists apply_hmo_payroll_estimate on public.payroll_runs;
create trigger apply_hmo_payroll_estimate
after update of calculated_at on public.payroll_runs
for each row execute function public.apply_hmo_payroll_estimate();
