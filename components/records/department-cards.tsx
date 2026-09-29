"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronRight, LoaderCircle, MoreHorizontal, UsersRound } from "lucide-react";
import { readDepartmentCards, type DepartmentCardData } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { RecordRow } from "@/lib/records/config";

const accents = [
  { bar: "bg-violet-500", icon: "bg-violet-500", initials: "bg-violet-50 text-violet-700" },
  { bar: "bg-fuchsia-500", icon: "bg-fuchsia-500", initials: "bg-fuchsia-50 text-fuchsia-700" },
  { bar: "bg-emerald-500", icon: "bg-emerald-500", initials: "bg-emerald-50 text-emerald-700" },
  { bar: "bg-orange-500", icon: "bg-orange-500", initials: "bg-orange-50 text-orange-700" },
  { bar: "bg-sky-500", icon: "bg-sky-500", initials: "bg-sky-50 text-sky-700" },
  { bar: "bg-pink-500", icon: "bg-pink-500", initials: "bg-pink-50 text-pink-700" },
  { bar: "bg-teal-500", icon: "bg-teal-500", initials: "bg-teal-50 text-teal-700" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function asRecord(department: DepartmentCardData): RecordRow {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    updated_at: department.updatedAt,
  };
}

export function DepartmentCards({
  configured,
  canWrite,
  onEdit,
  onView,
  onDelete,
}: {
  configured: boolean;
  canWrite: boolean;
  onEdit: (record: RecordRow) => void;
  onView: (record: RecordRow) => void;
  onDelete: (record: RecordRow) => void;
}) {
  const [departments, setDepartments] = useState<DepartmentCardData[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(configured);
  const [selected, setSelected] = useState<DepartmentCardData | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    if (!configured) return () => { active = false; };
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const result = await readDepartmentCards();
        if (!active) return;
        if (result.ok) {
          setDepartments(result.data);
          setError("");
        } else {
          setError(result.message);
        }
      } catch {
        if (active) setError("Unable to load departments. Try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [configured, refreshToken]);

  useEffect(() => {
    const refresh = () => setRefreshToken((current) => current + 1);
    window.addEventListener("department-records-refresh", refresh);
    return () => window.removeEventListener("department-records-refresh", refresh);
  }, []);

  if (!configured) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Connect the database to view departments.</p>;
  if (error) return <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (loading && !departments.length) return <div className="flex items-center justify-center gap-2 rounded-xl border bg-white py-16 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Loading departments…</div>;
  if (!departments.length) return <div className="rounded-xl border bg-white py-16 text-center text-sm text-slate-500">No departments yet. Create one to get started.</div>;

  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {departments.map((department, index) => {
        const accent = accents[index % accents.length];

        return <article key={department.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className={`h-1.5 ${accent.bar}`} />
          <div className="p-4">
            <div className="flex min-h-12 items-center gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-white ${accent.icon}`}><Building2 className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-slate-900">{department.name}</h3>
                <span className="mt-1 inline-flex rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-medium tracking-wide text-slate-600">{department.code}</span>
              </div>
              {canWrite && <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${department.name}`} className="size-8"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onView(asRecord(department))}>View details</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onEdit(asRecord(department))}>Edit department</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:text-red-700" onSelect={() => onDelete(asRecord(department))}>Delete department</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setSelected(department)} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                <UsersRound className="size-3.5" />
                {department.memberCount} {department.memberCount === 1 ? "member" : "members"}
                <ChevronRight className="size-3.5" />
              </button>
              <div className="flex -space-x-1.5" aria-label={`${department.members.length} active employees`}>
                {department.members.slice(0, 4).map((member) => <span key={member.id} title={member.name} className={`grid size-6 place-items-center rounded-full border-2 border-white text-[9px] font-semibold ${accent.initials}`}>{initials(member.name)}</span>)}
                {department.members.length > 4 && <span className="grid size-6 place-items-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-semibold text-slate-600">+{department.members.length - 4}</span>}
              </div>
            </div>
          </div>
        </article>;
      })}
    </div>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
      <DialogContent>
        <DialogTitle>{selected?.name ?? "Department members"}</DialogTitle>
        <DialogDescription>{selected?.code} · {selected?.memberCount ?? 0} active employees</DialogDescription>
        <ul className="mt-4 max-h-[55vh] divide-y overflow-y-auto">
          {selected?.members.map((member) => <li key={member.id} className="flex items-center gap-3 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">{initials(member.name)}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{member.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{member.employeeNumber}</span>
          </li>)}
          {selected?.members.length === 0 && <li className="py-8 text-center text-sm text-slate-500">No active employees are assigned to this department.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  </>;
}
