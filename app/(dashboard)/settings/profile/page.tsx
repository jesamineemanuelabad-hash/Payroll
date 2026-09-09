import { AccountSettings, type AccountProfile } from "@/components/account/account-settings";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export default async function ProfileSettingsPage() {
  if (!hasSupabaseEnvironment()) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-semibold text-amber-950">Account settings unavailable</h1><p className="mt-2 text-sm text-amber-800">Connect Supabase and sign in to manage your administrator profile.</p></div>;
  const db=await createSupabaseServerClient();
  const {data:auth}=await db.auth.getUser();
  if (!auth.user) return null;
  const [{data:profile,error},{data:roles},{data:factors}]=await Promise.all([
    db.from("profiles").select("id,employee_number,first_name,last_name,email,job_title,location,is_system_owner,is_payroll_employee").eq("id",auth.user.id).single(),
    db.rpc("record_roles",{}),
    db.auth.mfa.listFactors(),
  ]);
  if (error||!profile) return <div className="rounded-xl border border-red-200 bg-red-50 p-6"><h1 className="text-xl font-semibold text-red-950">Identity profile unavailable</h1><p className="mt-2 text-sm text-red-800">Apply all migrations and confirm this Auth user has a profile and role.</p></div>;
  const value:AccountProfile={id:profile.id,employeeNumber:profile.employee_number,firstName:profile.first_name,lastName:profile.last_name,email:profile.email,jobTitle:profile.job_title,location:profile.location,isSystemOwner:profile.is_system_owner,isPayrollEmployee:profile.is_payroll_employee,roles:roles??[]};
  return <AccountSettings profile={value} mfaFactorCount={factors?.totp?.length??0}/>;
}
