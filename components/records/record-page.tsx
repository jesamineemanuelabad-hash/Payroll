import { RecordWorkspace } from "@/components/records/record-workspace";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export async function RecordPage({ entityKeys, parent }: { entityKeys: readonly string[]; parent?: string }) {
  const configured = hasSupabaseEnvironment();
  let roles: string[] = [];
  let setupError: string | undefined;
  if (configured) {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("record_roles", {});
    if (error) setupError = "Role lookup failed. Apply all migrations and provision your profile and role assignment.";
    else roles = data ?? [];
  }
  return <RecordWorkspace entityKeys={entityKeys} parent={parent} roles={roles} configured={configured} setupError={setupError} />;
}
