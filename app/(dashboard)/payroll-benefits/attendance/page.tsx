import { RecordPage } from "@/components/records/record-page";
import { modules } from "@/lib/records/config";
import { OperationsPageHeader, SyncButton } from "@/components/shared/operations-ui";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export default async function Page() {
  let canSynchronize = false;
  if (hasSupabaseEnvironment()) {
    const db = await createSupabaseServerClient();
    const { data: roles } = await db.rpc("record_roles", {});
    canSynchronize = Boolean(roles?.some((role) => ["super_admin", "hr_admin", "payroll_manager"].includes(role)));
  }
  return <div><OperationsPageHeader eyebrow="Time & Attendance" title="HR2 time and attendance synchronization" description="Employee master data comes from HR2. Synchronize employees, attendance, effective compensation, and approved requests; imported records appear in the tabs immediately." actions={canSynchronize ? <SyncButton label="Sync with HR2" /> : undefined} /><RecordPage entityKeys={modules.attendance} /></div>;
}
