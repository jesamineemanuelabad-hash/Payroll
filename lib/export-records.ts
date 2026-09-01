"use client";

import type { ExportRecord, ExportValue } from "@/types/operations";
import type { Row, SheetData } from "write-excel-file/browser";

export type ExportColumn = {
  key: string;
  label: string;
  width?: number;
  format?: "currency" | "date" | "number";
};

function normalizeValue(value: ExportValue, format?: ExportColumn["format"]) {
  if (format === "date" && typeof value === "string") return new Date(`${value}T00:00:00`);
  return value;
}

export async function exportRecordsToExcel(fileName: string, sheetName: string, columns: ExportColumn[], records: ExportRecord[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header: Row = columns.map((column) => ({
    value: column.label,
    fontWeight: "bold" as const,
    backgroundColor: "#EEF2FF",
    color: "#312E81",
    borderColor: "#D8DEE8",
    align: "left" as const,
  }));
  const body: Row[] = records.map((record) => columns.map((column) => {
    const value = normalizeValue(record[column.key] ?? "", column.format);
    return {
      value,
      type: value instanceof Date ? Date : typeof value === "number" ? Number : typeof value === "boolean" ? Boolean : String,
      format: column.format === "currency" ? "₱#,##0.00" : column.format === "date" ? "mmm d, yyyy" : undefined,
      borderColor: "#E5E7EB",
      wrap: true,
    };
  }));

  const sheetData: SheetData = [header, ...body];
  const file = writeXlsxFile(sheetData, {
    sheet: sheetName.slice(0, 31),
    columns: columns.map((column) => ({ width: column.width ?? 18 })),
    stickyRowsCount: 1,
    showGridLines: false,
  });
  await file.toFile(fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

export function downloadRecordsAsCsv(fileName: string, columns: ExportColumn[], records: ExportRecord[]) {
  const escape = (value: ExportValue) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [
    columns.map((column) => escape(column.label)).join(","),
    ...records.map((record) => columns.map((column) => escape(record[column.key] ?? "")).join(",")),
  ].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
