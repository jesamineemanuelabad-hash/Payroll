import { RecordWorkspace } from "@/components/records/record-workspace";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export type RecordPageAccess = { roles: string[]; configured: boolean; setupError?: string };

export async function getRecordPageAccess(): Promise<RecordPageAccess> {
  const configured = hasSupabaseEnvironment();
  let roles: string[] = [];
  let setupError: string | undefined;
  if (configured) {
    const db = await createSupabaseServerClient();
    const { data, error } = await db.rpc("record_roles", {});
    if (error) setupError = "Role lookup failed. Apply all migrations and provision your profile and role assignment.";
    else roles = data ?? [];
  }
  return { roles, configured, setupError };
}

export async function RecordPage({ entityKeys, parent }: { entityKeys: readonly string[]; parent?: string }) {
  const access = await getRecordPageAccess();
  return <RecordWorkspace entityKeys={entityKeys} parent={parent} {...access} />;
}
