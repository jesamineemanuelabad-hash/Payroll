import { ClaimsWorkspace } from "@/components/claims/claims-workspace";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export default async function Page() {
  const configured = hasSupabaseEnvironment();
  let roles: string[] = [];
  if (configured) {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("record_roles", {});
    if (!error) roles = data ?? [];
  }
  return <ClaimsWorkspace configured={configured} roles={roles} />;
}
