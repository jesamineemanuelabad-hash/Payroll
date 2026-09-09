-- Self-service account settings for system owners and other authenticated users.

create or replace function public.update_my_account_profile(
  p_first_name text,
  p_last_name text,
  p_job_title text,
  p_location text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare saved jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to update your profile' using errcode='42501'; end if;
  if nullif(btrim(p_first_name),'') is null or length(btrim(p_first_name))>100
     or nullif(btrim(p_last_name),'') is null or length(btrim(p_last_name))>100
     or nullif(btrim(p_job_title),'') is null or length(btrim(p_job_title))>150
     or length(coalesce(btrim(p_location),''))>150 then
    raise exception 'Review the profile values' using errcode='22023';
  end if;

  update public.profiles
  set first_name=btrim(p_first_name),last_name=btrim(p_last_name),job_title=btrim(p_job_title),location=nullif(btrim(p_location),'')
  where id=auth.uid()
  returning jsonb_build_object(
    'id',id,'employeeNumber',employee_number,'firstName',first_name,'lastName',last_name,
    'email',email,'jobTitle',job_title,'location',location,'isSystemOwner',is_system_owner,
    'isPayrollEmployee',is_payroll_employee,'updatedAt',updated_at
  ) into saved;

  if saved is null then raise exception 'Your identity profile is missing' using errcode='P0002'; end if;
  return saved;
end $$;

revoke all on function public.update_my_account_profile(text,text,text,text) from public,anon;
grant execute on function public.update_my_account_profile(text,text,text,text) to authenticated;

comment on function public.update_my_account_profile(text,text,text,text) is 'Updates allowlisted identity fields for the signed-in account without exposing protected system-owner or payroll flags.';
