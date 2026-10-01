import { OperationsPageHeader } from "@/components/shared/operations-ui";
import { RecordPage } from "@/components/records/record-page";
import { modules } from "@/lib/records/config";

export default function Page() {
  return <div><OperationsPageHeader eyebrow="Employee Management" title="Employee records" description="Review employee profiles, attendance, and leave requests. Approved paid leave flows into draft payroll calculations." /><RecordPage entityKeys={modules.attendance} /></div>;
}
