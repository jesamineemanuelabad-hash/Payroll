"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { Check, Copy, KeyRound, LoaderCircle, Smartphone } from "lucide-react";
import { beginTotpEnrollment, verifyTotp, type MfaEnrollmentState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialEnrollment: MfaEnrollmentState = { error: "" };

export function MfaEnrollment({ addAnother = false }: { addAnother?: boolean }) {
  const [enrollment, beginAction, beginning] = useActionState(beginTotpEnrollment, initialEnrollment);
  const [verification, verifyAction, verifying] = useActionState(verifyTotp, { error: "" });
  const [copied, setCopied] = useState(false);

  if (!enrollment.factorId || !enrollment.qrCode || !enrollment.secret) {
    return (
      <form action={beginAction}>
        <div className="flex gap-3 rounded-2xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-indigo-600" />
          <p>{addAnother ? "Add a backup authenticator so you can still sign in if your primary device is unavailable." : "Use an authenticator app to generate a secure code whenever you sign in."}</p>
        </div>
        {enrollment.error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{enrollment.error}</p>}
        <Button className="mt-5 h-11 w-full" disabled={beginning}>{beginning ? <><LoaderCircle className="animate-spin" />Preparing setup…</> : <><KeyRound />{addAnother ? "Add another authenticator" : "Set up authenticator"}</>}</Button>
      </form>
    );
  }

  return (
    <div>
      <ol className="space-y-5">
        <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">1</span><div><p className="text-sm font-semibold text-slate-900">Scan this QR code</p><p className="mt-1 text-xs leading-5 text-slate-500">Open Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</p></div></li>
      </ol>
      <div className="mx-auto mt-5 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <Image src={enrollment.qrCode} width={208} height={208} unoptimized alt="Authenticator enrollment QR code" className="size-52" />
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-medium text-slate-500">Cannot scan? Enter this setup key manually.</p>
        <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 break-all text-xs font-semibold tracking-[0.08em] text-slate-800">{enrollment.secret}</code><button type="button" aria-label="Copy setup key" onClick={async()=>{await navigator.clipboard.writeText(enrollment.secret!);setCopied(true);setTimeout(()=>setCopied(false),1600);}} className="grid size-9 shrink-0 place-items-center rounded-lg border bg-white text-slate-500 transition hover:text-indigo-600">{copied?<Check className="size-4 text-emerald-600"/>:<Copy className="size-4"/>}</button></div>
      </div>
      <form action={verifyAction} className="mt-6">
        <input type="hidden" name="factorId" value={enrollment.factorId} />
        <input type="hidden" name="next" value="/overview" />
        <label htmlFor="enrollment-code" className="text-sm font-medium text-slate-700">Verification code</label>
        <Input id="enrollment-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus className="mt-2 h-12 text-center text-lg tracking-[0.35em]" placeholder="000000" />
        {verification.error && <p role="alert" className="mt-3 text-sm text-red-600">{verification.error}</p>}
        <Button className="mt-4 h-11 w-full" disabled={verifying}>{verifying ? <><LoaderCircle className="animate-spin" />Verifying…</> : "Verify and continue"}</Button>
      </form>
    </div>
  );
}
