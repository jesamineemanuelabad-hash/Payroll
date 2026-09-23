"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/browser";
import { toast } from "sonner";
import { importSpreadsheetRows } from "@/app/actions/imports";
import { rowsFromMatrix } from "@/lib/imports/spreadsheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Props = { entity: string; disabled?: boolean; onImported: () => void };

export function SpreadsheetImportButton({ entity, disabled, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ imported: number; updated: number; skipped: number; errors: { row: number; message: string }[]; warnings: { row: number; message: string }[] } | null>(null);

  async function selectFile(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    try {
      let matrix: unknown[][];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const csv = Papa.parse<unknown[]>(await file.text(), { skipEmptyLines: true });
        const firstError = csv.errors[0];
        if (firstError) throw new Error(`CSV row ${(firstError.row ?? 0) + 1}: ${firstError.message}`);
        matrix = csv.data;
      } else matrix = await readXlsxFile(file) as unknown as unknown[][];
      const rows = rowsFromMatrix(matrix);
      if (!rows.length) throw new Error("The file has headers but no data rows.");
      if (rows.length > 1000) throw new Error("Import at most 1,000 rows at a time.");
      const result = await importSpreadsheetRows({ entity, rows });
      if (!result.ok) throw new Error(result.message);
      setReport(result.data);
      if (result.data.imported + result.data.updated > 0) onImported();
      const description = `${result.data.imported} created, ${result.data.updated} updated, ${result.data.skipped} skipped.`;
      if (result.data.skipped) toast.warning("Import completed with row errors", { description });
      else if (result.data.warnings.length) toast.success("All valid employees imported", { description: `${description} ${result.data.warnings.length} duplicate placeholder IDs were corrected automatically.` });
      else toast.success("Spreadsheet imported", { description });
    } catch (cause) {
      toast.error("Import failed", { description: cause instanceof Error ? cause.message : "The spreadsheet could not be read." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <>
    <input ref={input} className="hidden" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => void selectFile(event.target.files?.[0])} />
    <Button disabled={disabled || busy} onClick={() => input.current?.click()}><Upload />{busy ? "Importing…" : "Import Excel / CSV"}</Button>
    <Dialog open={Boolean(report)} onOpenChange={(open) => { if (!open) setReport(null); }}><DialogContent className="max-w-2xl"><DialogTitle>Import report</DialogTitle><DialogDescription>{report && `${report.imported} created, ${report.updated} updated, and ${report.skipped} skipped.`}</DialogDescription>
      {report?.warnings.length ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-medium">{report.warnings.length} employees with duplicate placeholder IDs were imported successfully.</p><p className="mt-1 leading-5 text-emerald-800">The system assigned stable employee numbers using each unique email. Use Email—not the duplicated source ID—when importing attendance for these employees.</p><details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-emerald-800">View corrected Excel rows</summary><ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">{report.warnings.map((warning, index)=><li key={`${warning.row}-${index}`}>Row {warning.row}: {warning.message.match(/stable ID ([A-Z0-9_]+)/)?.[1]??"ID corrected"}</li>)}</ul></details></div> : null}
      {report?.errors.length ? <div className="mt-4 max-h-72 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50"><tr><th className="px-3 py-2">Excel row</th><th className="px-3 py-2">Reason</th></tr></thead><tbody>{report.errors.map((error, index) => <tr key={`${error.row}-${index}`} className="border-t"><td className="px-3 py-2 align-top">{error.row}</td><td className="px-3 py-2 text-red-700">{error.message}</td></tr>)}</tbody></table></div> : !report?.warnings.length ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Every row was imported successfully.</p> : null}
    </DialogContent></Dialog>
  </>;
}
