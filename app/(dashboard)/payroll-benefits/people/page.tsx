import { RecordPage } from "@/components/records/record-page";
import { OperationsPageHeader } from "@/components/shared/operations-ui";

export default function PeoplePage() {
  return <div>
    <OperationsPageHeader eyebrow="People" title="Employee directory" description="View and maintain payroll-eligible employee profiles, employment details, departments, job titles, locations, and hire dates." />
    <RecordPage entityKeys={["profiles"]} />
  </div>;
}
