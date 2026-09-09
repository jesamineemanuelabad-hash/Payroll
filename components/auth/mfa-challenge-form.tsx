"use client";

import { useActionState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { verifyTotp } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Factor = { id: string; friendlyName: string };

export function MfaChallengeForm({ factors, next }: { factors: Factor[]; next: string }) {
  const [state, action, pending] = useActionState(verifyTotp, { error: "" });
  return (
    <form action={action}>
      <label htmlFor="challenge-factor" className="text-sm font-medium text-slate-700">Authenticator</label>
      <select id="challenge-factor" name="factorId" className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100">
        {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendlyName}</option>)}
      </select>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="challenge-code" className="mt-5 block text-sm font-medium text-slate-700">Six-digit code</label>
      <div className="relative mt-2"><KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400"/><Input id="challenge-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus className="h-12 pl-11 text-center text-lg tracking-[0.35em]" placeholder="000000" /></div>
      {state.error && <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <Button className="mt-5 h-11 w-full" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" />Verifying…</> : "Verify and open workspace"}</Button>
      <p className="mt-4 text-center text-xs leading-5 text-slate-500">Codes refresh every 30 seconds. If a code fails near expiry, wait for the next one.</p>
    </form>
  );
}
