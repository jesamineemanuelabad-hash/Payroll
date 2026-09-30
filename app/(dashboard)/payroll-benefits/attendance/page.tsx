import { RecordPage } from "@/components/records/record-page";
import { modules } from "@/lib/records/config";
import { OperationsPageHeader } from "@/components/shared/operations-ui";

export default function Page() {
  return <div><OperationsPageHeader eyebrow="Employee Management" title="Employee records" description="View employee profiles, attendance, and effective compensation. HR2 remains the source of truth for employee and leave records." /><RecordPage entityKeys={modules.attendance} /></div>;
}
