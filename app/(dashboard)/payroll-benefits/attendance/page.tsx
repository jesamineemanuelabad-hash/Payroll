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
  return <div><OperationsPageHeader eyebrow="Employee & Attendance" title="Employee and attendance operations" description="Maintain employee, time, leave, and department records. Authorized users can retrieve the latest employee, attendance, compensation, and approved-request data from ESS." actions={canSynchronize ? <SyncButton /> : undefined} /><RecordPage entityKeys={modules.attendance} /></div>;
}
