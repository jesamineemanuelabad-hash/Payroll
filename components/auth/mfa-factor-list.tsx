"use client";

import { useActionState } from "react";
import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { removeTotpFactor } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function MfaFactorList({ factors, required }: { factors: Array<{ id: string; name: string; createdAt: string }>; required: boolean }) {
  const [state, action, pending] = useActionState(removeTotpFactor, { error: "" });
  const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" });
  return <div>
    <div className="space-y-3">{factors.map((factor)=><div key={factor.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><ShieldCheck className="size-4"/></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{factor.name}</p><p className="text-xs text-slate-500">Added {dateFormatter.format(new Date(factor.createdAt))}</p></div><form action={action}><input type="hidden" name="factorId" value={factor.id}/><Button type="submit" variant="ghost" size="icon" aria-label={`Remove ${factor.name}`} disabled={pending}>{pending?<LoaderCircle className="animate-spin"/>:<Trash2 className="text-slate-400"/>}</Button></form></div>)}</div>
    {state.error&&<p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
    {required&&factors.length===1&&<p className="mt-3 text-xs leading-5 text-slate-500">Your role requires at least one authenticator. Add a backup before removing this device.</p>}
  </div>;
}
