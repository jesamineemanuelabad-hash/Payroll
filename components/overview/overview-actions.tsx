"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadRecordsAsCsv } from "@/lib/export-records";
import type { LiveDashboardData } from "@/lib/dashboard/schema";

export function DownloadOverviewReport({ data }: { data: LiveDashboardData }) {
  function downloadReport() {
    const period = data.readiness
      ? `${data.readiness.periodStart} to ${data.readiness.periodEnd}`
      : "No payroll run";
    const rows = [
      { metric: "Active employees", value: data.summary.employeeCount, period: "Current" },
      { metric: "Net payroll", value: data.summary.currentNet, period },
      { metric: "Gross payroll", value: data.summary.currentGross, period },
      { metric: "Benefits", value: data.summary.currentBenefits, period },
      { metric: "Employer contributions", value: data.summary.currentContributions, period },
      { metric: "Open action items", value: data.summary.openActions, period: data.generatedAt },
    ];
    downloadRecordsAsCsv(
      `people-overview-${data.generatedAt.slice(0, 10)}`,
      [{ key: "metric", label: "Metric" }, { key: "value", label: "Value" }, { key: "period", label: "Period" }],
      rows,
    );
    toast.success("Live overview report downloaded", { description: `${rows.length} current metrics were saved.` });
  }

  return <Button variant="secondary" onClick={downloadReport}><Download />Download report</Button>;
}
