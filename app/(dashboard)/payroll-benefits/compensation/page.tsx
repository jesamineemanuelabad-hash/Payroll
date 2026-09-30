import { CompensationPlanningWorkspace } from "@/components/compensation/compensation-planning-workspace";
import { readCompensationPlanning } from "@/app/actions/records";
import { getRecordPageAccess } from "@/components/records/record-page";
import type { CompensationTab } from "@/components/compensation/compensation-planning-workspace";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const [{ tab }, result, access] = await Promise.all([searchParams, readCompensationPlanning(), getRecordPageAccess()]);
  const initialTab: CompensationTab = tab === "proposals" || tab === "criteria" || tab === "credentials" || tab === "cycles" ? tab : "planning";
  return <CompensationPlanningWorkspace
    key={initialTab}
    {...access}
    snapshot={result.ok ? result.data : null}
    error={result.ok ? undefined : result.message}
    initialTab={initialTab}
  />;
}
