"use client";

import { useActionState } from "react";
import { KeyRound, LoaderCircle, Mail } from "lucide-react";
import { emailOtpChallenge } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState = { error: "", sent: false, message: "" };

export function MfaChallengeForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState(emailOtpChallenge, initialState);
  return (
    <form action={action}>
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <Mail className="mt-0.5 size-5 shrink-0 text-slate-500" />
        <p className="text-sm leading-6 text-slate-600">We’ll send a one-time code to <span className="font-medium text-slate-900">{email}</span> to confirm you can access this email account.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      {state.sent && <>
        <label htmlFor="email-code" className="mt-5 block text-sm font-medium text-slate-700">Six-digit email code</label>
        <div className="relative mt-2"><KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="email-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus className="h-12 pl-11 text-center text-lg tracking-[0.35em]" placeholder="000000" /></div>
      </>}
      {state.message && <p role="status" className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">{state.message}</p>}
      {state.error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
      <div className="mt-5 flex flex-col gap-2">
        {!state.sent ? <Button name="intent" value="send" className="h-11 w-full" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" />Sending code…</> : "Email me a code"}</Button> : <>
          <Button name="intent" value="verify" className="h-11 w-full" disabled={pending}>{pending ? <><LoaderCircle className="animate-spin" />Verifying…</> : "Verify and open workspace"}</Button>
          <Button type="submit" name="intent" value="send" variant="secondary" className="w-full" disabled={pending} formNoValidate>{pending ? "Please wait…" : "Send a new code"}</Button>
        </>}
      </div>
      <p className="mt-4 text-center text-xs leading-5 text-slate-500">The code expires shortly. If it expires, request a new one.</p>
    </form>
  );
}
