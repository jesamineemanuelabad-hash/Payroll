import { RecordPage } from "@/components/records/record-page";
import { modules } from "@/lib/records/config";
import { OperationsPageHeader } from "@/components/shared/operations-ui";

export default function Page() {
  return <div><OperationsPageHeader eyebrow="Employee Management" title="Employee records" description="View employee profiles, attendance, effective compensation, and approved requests. Employee records are demo data in Supabase; HR2 integration is planned." /><RecordPage entityKeys={modules.attendance} /></div>;
}
