import { AccessControl,type AccessSnapshot } from "@/components/account/access-control";
import { hasSupabaseAdminEnvironment } from "@/lib/supabase/admin";
import { createSupabaseServerClient,hasSupabaseEnvironment } from "@/lib/supabase/server";

export default async function AccessControlPage(){
  if(!hasSupabaseEnvironment())return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-semibold text-amber-950">Access control unavailable</h1><p className="mt-2 text-sm text-amber-800">Connect Supabase and sign in as the super administrator.</p></div>;
  const db=await createSupabaseServerClient();const {data,error}=await db.rpc("admin_access_snapshot",{p_search:""});
  if(error)return <div className="rounded-xl border border-red-200 bg-red-50 p-6"><h1 className="text-xl font-semibold text-red-950">Access control restricted</h1><p className="mt-2 text-sm text-red-800">{error.code==="PGRST202"?"Apply the RBAC management migration first.":"Only a super administrator can open this page."}</p></div>;
  return <AccessControl data={data as unknown as AccessSnapshot} invitationsEnabled={hasSupabaseAdminEnvironment()}/>;
}
