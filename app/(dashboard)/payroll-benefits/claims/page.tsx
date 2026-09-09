import { RecordPage } from "@/components/records/record-page";
import { modules } from "@/lib/records/config";

export default function Page() {
  return <RecordPage entityKeys={modules.claims} />;
}
