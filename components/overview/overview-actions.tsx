"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DownloadOverviewReport() {
  function downloadReport() {
    const rows = [
      ["Metric", "Value", "Period"],
      ["Active employees", "248", "August 2026"],
      ["Net payroll", "6302020.00", "Aug 16-31, 2026"],
      ["Benefits cost", "857400.00", "August 2026"],
      ["Pending approvals", "14", "As of Aug 28, 2026"],
    ];
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "people-overview-2026-08-28.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Overview report downloaded", { description: "The August 2026 workforce summary is ready." });
  }

  return <Button variant="secondary" onClick={downloadReport}><Download />Download report</Button>;
}
