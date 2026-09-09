import { HrAnalyticsDashboard } from "@/components/analytics/hr-analytics-dashboard";
import { loadLiveDashboard } from "@/app/actions/dashboard";

export default async function HrAnalyticsPage() {
  const result = await loadLiveDashboard({ months: 12, departmentId: null, location: null, employmentType: null });
  if (!result.ok) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-lg font-semibold text-amber-950">Live analytics unavailable</h1><p className="mt-2 text-sm leading-6 text-amber-900">{result.message}</p></div>;
  return <HrAnalyticsDashboard initialData={result.data} />;
}
