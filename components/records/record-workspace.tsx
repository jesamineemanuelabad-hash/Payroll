"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileSpreadsheet, Pencil, Plus, RefreshCw, Search, Trash2, Eye, History } from "lucide-react";
import { toast } from "sonner";
import { deleteRecord, readRecords, readRecordHistory, resolveRecordLabels, saveRecord, type AuditEntry } from "@/app/actions/records";
import { entities, recordLabel, type Field, type RecordRow } from "@/lib/records/config";
import { downloadRecordsAsCsv, exportRecordsToExcel } from "@/lib/export-records";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = { entityKeys: readonly string[]; roles: string[]; configured: boolean; setupError?: string; parent?: string };
type Values = Record<string, string | number | boolean | null>;
const pretty = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

function ReferencePicker({ field, value, onChange, disabled }: { field: Field; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<RecordRow[]>([]);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const result = await readRecords({ entity: field.reference, search, size: 25 });
      if (!active) return;
      if (result.ok) { setOptions(result.data.rows); setError(""); } else setError(result.message);
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [field.reference, search]);
  useEffect(() => {
    if (!value) return;
    let active = true;
    readRecords({ entity: field.reference, id: value }).then((result) => { if (active && result.ok) setSelected(result.data.rows[0] ?? null); });
    return () => { active = false; };
  }, [field.reference, value]);
  const list = selected && selected.id === value && !options.some((row) => row.id === value) ? [selected, ...options] : options;
  return <div className="mt-1.5 space-y-2"><Input aria-label={`Search ${field.label}`} placeholder={`Search ${field.label.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} disabled={disabled} /><select id={`field-${field.key}`} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} required={field.required} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="">Select {field.label.toLowerCase()}</option>{value && !list.some((row) => row.id === value) && <option value={value}>{value}</option>}{list.map((row) => <option key={row.id} value={row.id}>{recordLabel(field.reference!, row)}</option>)}</select>{error && <p className="text-xs text-red-600" role="alert">{error}</p>}<p className="text-xs text-slate-500">Search to find additional records. Create missing records in their corresponding tab first.</p></div>;
}

function initialValues(entity: string, row: RecordRow | null, parent?: string): Values {
  return Object.fromEntries(entities[entity].fields.filter((field) => !row || !field.createOnly).map((field) => {
    let value = row?.[field.key] ?? (field.type === "number" ? 0 : field.type === "checkbox" ? false : field.options?.[0] ?? "");
    if (field.key === "payroll_run_id" && parent) value = parent;
    if (field.type === "datetime-local" && value) {
      const date = new Date(String(value));
      value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    return [field.key, value];
  }));
}

function RecordEditor({ entity, row, parent, close, saved }: { entity: string; row: RecordRow | null; parent?: string; close: () => void; saved: () => void }) {
  const config = entities[entity];
  const [values, setValues] = useState<Values>(() => initialValues(entity, row, parent));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = config.fields.filter((field) => !row || !field.createOnly);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setErrors({});
    try {
      const payload = Object.fromEntries(fields.map((field) => {
        let value = values[field.key];
        if (field.type === "datetime-local" && value) value = new Date(String(value)).toISOString();
        if (field.type === "number") value = value === "" ? null : Number(value);
        if (value === "" && !field.required) value = null;
        return [field.key, value];
      }));
      const result = await saveRecord({ entity, id: row?.id, version: row?.updated_at, values: payload });
      if (!result.ok) {
        setError(result.message); setErrors(result.fields ?? {});
        toast.error(`${pretty(config.singular)} ${row ? "update" : "creation"} failed`, { description: result.message });
        return;
      }
      const name = recordLabel(entity, result.data);
      toast.success(`${pretty(config.singular)} ${row ? "updated" : "created"}`, {
        description: `${name} was ${row ? "updated" : "created"} successfully. The change was saved to the database and added to the audit history.`,
      });
      saved();
    } catch {
      const message = "Unable to save. Refresh to check whether the change completed before retrying.";
      setError(message); toast.error(`${pretty(config.singular)} was not saved`, { description: message });
    }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) close(); }}><DialogContent className="max-w-2xl"><DialogTitle>{row ? "Edit" : "Create"} {config.singular}</DialogTitle><DialogDescription>{config.description}</DialogDescription><form onSubmit={submit} className="mt-5"><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">{fields.map((field) => {
    const disabled = Boolean(field.key === "payroll_run_id" && parent);
    const value = values[field.key];
    const change = (next: string | boolean) => setValues((current) => ({ ...current, [field.key]: next }));
    return <div key={field.key} className={cn(field.type === "textarea" && "sm:col-span-2")}><label htmlFor={`field-${field.key}`} className="text-sm font-medium text-slate-700">{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>{field.reference ? <ReferencePicker field={field} value={String(value ?? "")} onChange={change} disabled={busy || disabled} /> : field.type === "select" ? <select id={`field-${field.key}`} className="mt-1.5 h-10 w-full rounded-lg border bg-white px-3 text-sm" value={String(value ?? "")} onChange={(event) => change(event.target.value)} required={field.required}>{field.options?.map((option) => <option key={option} value={option}>{pretty(option)}</option>)}</select> : field.type === "textarea" ? <textarea id={`field-${field.key}`} rows={3} className="mt-1.5 w-full rounded-lg border p-3 text-sm" value={String(value ?? "")} onChange={(event) => change(event.target.value)} required={field.required} maxLength={4000} /> : field.type === "checkbox" ? <input id={`field-${field.key}`} type="checkbox" checked={Boolean(value)} onChange={(event) => change(event.target.checked)} className="ml-3 size-4 accent-indigo-600" /> : <Input id={`field-${field.key}`} className="mt-1.5" type={field.type ?? "text"} min={field.min} step={field.type === "number" ? field.key.endsWith("_minutes") ? "1" : "0.01" : undefined} value={String(value ?? "")} onChange={(event) => change(event.target.value)} required={field.required} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : undefined} />}{field.help && <p className="mt-1 text-xs leading-5 text-slate-500">{field.help}</p>}{errors[field.key] && <p id={`error-${field.key}`} className="mt-1 text-xs text-red-600">{errors[field.key].join(" ")}</p>}</div>;
  })}</fieldset>{error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-2 border-t pt-4"><Button type="button" variant="secondary" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save record"}</Button></div></form></DialogContent></Dialog>;
}

function RecordGrid({ entity, roles, configured, setupError, parent }: Omit<Props, "entityKeys"> & { entity: string }) {
  const config = entities[entity];
  const canWrite = configured && roles.some((role) => config.roles.includes(role));
  const canCreate = canWrite && config.allowCreate !== false;
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState(setupError ?? "");
  const [editor, setEditor] = useState<{ row: RecordRow | null } | null>(null);
  const [detail, setDetail] = useState<RecordRow | null>(null);
  const [deleting, setDeleting] = useState<RecordRow | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<{ row: RecordRow; events: AuditEntry[] } | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const generation = useRef(0);

  const refresh = useCallback(() => {
    if (!configured) return Promise.resolve();
    const current = ++generation.current;
    return readRecords({ entity, page, search: query, parent }).then((result) => {
      if (current !== generation.current) return;
      if (!result.ok) { setError(result.message); setRows([]); setCount(0); return; }
      setError(""); setRows(result.data.rows); setCount(result.data.count);
      if (page > 0 && !result.data.rows.length) setPage((value) => Math.max(0, value - 1));
    }).catch(() => { if (current === generation.current) setError("Unable to load records. Try again."); })
      .finally(() => { if (current === generation.current) setLoading(false); });
  }, [configured, entity, page, parent, query]);
  useEffect(() => { void refresh(); const tracker = generation; return () => { tracker.current++; }; }, [refresh]);
  useEffect(() => {
    if (!["profiles", "attendance_records", "employee_compensation_history", "leave_requests"].includes(entity)) return;
    const synced = () => { setPage(0); setQuery(""); setSearch(""); void refresh(); };
    window.addEventListener("hr2-sync-complete", synced);
    return () => window.removeEventListener("hr2-sync-complete", synced);
  }, [entity, refresh]);
  useEffect(() => {
    let active = true;
    const referenceOverrides: Record<string, string> = {
      reviewer_id: "profiles",
      finance_approver_id: "profiles",
      approver_id: "profiles",
      approved_by: "profiles",
      hr_reviewer_id: "profiles",
      finance_reviewer_id: "profiles",
    };
    const references = [
      ...config.fields.filter((field) => field.reference),
      ...config.columns.filter((key) => referenceOverrides[key] && !config.fields.some((field) => field.key === key)).map((key) => ({ key, reference: referenceOverrides[key] } as Field)),
    ];
    const requests = references.map((field) => ({ entity: field.reference!, ids: [...new Set(rows.map((row) => row[field.key]).filter(Boolean).map(String))] }));
    resolveRecordLabels(requests).then((entries) => { if (active) setLabels(entries); }).catch(() => { if (active) setLabels({}); });
    return () => { active = false; };
  }, [rows, config]);
  function display(key: string, value: RecordRow[string]) {
    if (value === null || value === undefined || value === "") return "—";
    if (labels[String(value)]) return labels[String(value)];
    if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (key === "time_in" || key === "time_out" || key.endsWith("_at")) return new Date(String(value)).toLocaleString();
    return String(value).replaceAll("_", " ");
  }
  async function remove() {
    if (!deleting || busy) return;
    const deletedLabel = recordLabel(entity, deleting);
    setBusy(true); setDeleteError("");
    try {
      const result = await deleteRecord({ entity, id: deleting.id, version: deleting.updated_at });
      if (!result.ok) {
        setDeleteError(result.message);
        toast.error(`${pretty(config.singular)} deletion failed`, { description: `${deletedLabel} was not removed. ${result.message}` });
        return;
      }
      setDeleting(null);
      toast.success(`${pretty(config.singular)} deleted`, { description: `${deletedLabel} was removed successfully. Its audit history is still retained.` });
      await refresh();
    } catch {
      const message = "Delete could not be confirmed. Refresh the list before retrying.";
      setDeleteError(message); toast.error(`${pretty(config.singular)} deletion failed`, { description: message });
    }
    finally { setBusy(false); }
  }
  async function showHistory(row: RecordRow) {
    try {
      const result = await readRecordHistory(entity, row.id);
      if (!result.ok) { toast.error(result.message); return; }
      setHistory({ row, events: result.data });
    } catch { toast.error("Unable to load history."); }
  }
  async function exportAll(excel: boolean) {
    setExporting(true);
    try {
      const all: RecordRow[] = [];
      let total = 1;
      for (let exportPage = 0; all.length < total; exportPage++) {
        const result = await readRecords({ entity, search: query, size: 1000, page: exportPage, parent });
        if (!result.ok) throw new Error(result.message);
        total = result.data.count;
        all.push(...result.data.rows);
        if (!result.data.rows.length) break;
      }
      const columns = [...new Set(["id", ...config.fields.map((field) => field.key), ...config.columns])].map((key) => ({ key, label: config.fields.find((field) => field.key === key)?.label ?? pretty(key), width: 24 }));
      const records = all.map((row) => Object.fromEntries(columns.map(({ key }) => [key, row[key] ?? ""])));
      const filename = `${entity}-${new Date().toISOString().slice(0, 10)}`;
      if (excel) await exportRecordsToExcel(filename, config.title, columns, records); else downloadRecordsAsCsv(filename, columns, records);
      toast.success(`${records.length} records exported`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Export failed."); }
    finally { setExporting(false); }
  }

  return <section className="mt-5 space-y-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><h2 className="text-xl font-semibold text-slate-950">{config.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{config.description}</p></div>{canCreate && <Button onClick={() => setEditor({ row: null })}><Plus />Create {config.singular}</Button>}</div>
    {config.createNotice && <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">{config.createNotice}</p>}
    {!configured && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Database not connected. Set the Supabase environment variables, apply all migrations, and sign in to create and manage records. Saves are disabled until setup is complete.</p>}
    {configured && !canWrite && <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-600">Read-only access. Your account can view records permitted by its database role.</p>}
    <div className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center gap-2 border-b p-4"><form onSubmit={(event) => { event.preventDefault(); setPage(0); setQuery(search.trim()); }} className="flex min-w-0 flex-1 gap-2"><Input aria-label="Search records" maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" className="max-w-xs" /><Button type="submit" variant="secondary" disabled={!configured}><Search /><span className="sr-only sm:not-sr-only">Search</span></Button></form><Button variant="secondary" onClick={refresh} disabled={!configured || loading} aria-label="Refresh records"><RefreshCw className={loading ? "animate-spin" : ""} /></Button><Button variant="secondary" disabled={!configured || exporting || Boolean(error)} onClick={() => exportAll(false)}><Download />CSV</Button><Button variant="secondary" disabled={!configured || exporting || Boolean(error)} onClick={() => exportAll(true)}><FileSpreadsheet />{exporting ? "Exporting…" : "Excel"}</Button></div>
      {error && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto" aria-busy={loading}><table className="w-full min-w-[740px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{config.columns.map((key) => <th key={key} className="whitespace-nowrap px-4 py-3 font-medium">{config.fields.find((field) => field.key === key)?.label ?? pretty(key)}</th>)}<th className="px-4 py-3">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t hover:bg-slate-50/70">{config.columns.map((key) => <td key={key} className="max-w-xs px-4 py-4"><span className={cn(key === "status" && "inline-block rounded-md bg-slate-100 px-2 py-1 text-xs font-medium")}>{display(key, row[key])}</span></td>)}<td className="px-4 py-3"><div className="flex items-center gap-1"><Button variant="ghost" size="icon" aria-label="View record" onClick={() => setDetail(row)}><Eye /></Button>{entity === "payroll_runs" && <Link className="whitespace-nowrap px-2 text-xs font-medium text-indigo-600" href={`/payroll-benefits/payroll/${row.id}`}>Open entries</Link>}{canWrite && <><Button variant="ghost" size="icon" aria-label="Edit record" onClick={() => setEditor({ row })}><Pencil /></Button><Button variant="ghost" size="icon" aria-label="View audit history" onClick={() => showHistory(row)}><History /></Button><Button variant="ghost" size="icon" aria-label="Delete record" className="text-red-600" onClick={() => { setDeleting(row); setDeleteError(""); }}><Trash2 /></Button></>}</div></td></tr>)}</tbody></table>{!rows.length && !error && <p className="px-6 py-14 text-center text-sm text-slate-500">{loading ? "Loading records…" : query ? "No records match your search." : "No records yet."}</p>}</div><div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{count} records · Page {page + 1} of {Math.max(1, Math.ceil(count / 25))}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={(page + 1) * 25 >= count || loading} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></div>
    {editor && <RecordEditor entity={entity} row={editor.row} parent={parent} close={() => setEditor(null)} saved={() => { setEditor(null); void refresh(); }} />}
    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><DialogContent><DialogTitle>Delete this {config.singular}?</DialogTitle><DialogDescription>This permanently removes the record. Referenced, approved, and finalized records may be protected. The audit history is retained.</DialogDescription>{deleting && <p className="mt-4 break-all text-sm">{recordLabel(entity, deleting)}</p>}{deleteError && <p role="alert" className="mt-3 text-sm text-red-600">{deleteError}</p>}<div className="mt-6 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete record"}</Button></div></DialogContent></Dialog>
    <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) setDetail(null); }}><DialogContent className="max-w-2xl"><DialogTitle>{pretty(config.singular)} details</DialogTitle><DialogDescription>Saved database values for this record.</DialogDescription>{detail && <dl className="mt-4 divide-y">{[...new Set(["id", ...config.fields.map((field) => field.key), ...config.columns, "created_at", "updated_at"])].map((key) => <div key={key} className="grid grid-cols-[1fr_2fr] gap-4 py-2 text-sm"><dt className="text-slate-500">{pretty(key)}</dt><dd className="break-words">{key === "receipt_url" && typeof detail[key] === "string" && String(detail[key]).startsWith("https://") ? <a href={String(detail[key])} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Open supporting document</a> : display(key, detail[key])}</dd></div>)}</dl>}</DialogContent></Dialog>
    <Dialog open={Boolean(history)} onOpenChange={(open) => { if (!open) setHistory(null); }}><DialogContent className="max-w-2xl"><DialogTitle>Record audit history</DialogTitle><DialogDescription>Latest 100 changes, including actor, timestamp, and saved values.</DialogDescription><div className="mt-4 space-y-3">{history?.events.map((entry) => <details key={entry.id} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{pretty(entry.action)} · {new Date(entry.created_at).toLocaleString()}</summary><p className="mt-2 text-xs text-slate-500">Actor: {entry.user_id ?? "System"}</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify({ before: entry.old_values, after: entry.new_values }, null, 2)}</pre></details>)}{history && !history.events.length && <p className="text-sm text-slate-500">No recorded changes yet. Audit capture starts when the CRUD migration is applied.</p>}</div></DialogContent></Dialog>
  </section>;
}

export function RecordWorkspace(props: Props) {
  const [entity, setEntity] = useState(props.entityKeys[0]);
  return <div>{props.entityKeys.length > 1 && <nav aria-label="Record categories" className="flex gap-2 overflow-x-auto border-b pb-3">{props.entityKeys.map((key) => <button key={key} onClick={() => setEntity(key)} className={cn("shrink-0 rounded-lg px-4 py-2 text-sm font-medium", entity === key ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-50")}>{entities[key].title}</button>)}</nav>}<RecordGrid key={`${entity}-${props.parent ?? ""}`} {...props} entity={entity} /></div>;
}
