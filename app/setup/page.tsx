"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, CircleAlert, Eye, EyeOff,
  KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, UserRoundPlus,
} from "lucide-react";
import { createFirstAdmin } from "@/app/actions/admin-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState = { error: "", success: "" };

export default function AdminSetupPage() {
  const [state, action, pending] = useActionState(createFirstAdmin, initialState);
  const [showSecrets, setShowSecrets] = useState(false);
  const complete = Boolean(state.success);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-50 px-5 py-8 text-slate-950 sm:px-8 lg:grid lg:place-items-center lg:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_70%_0%,rgba(99,102,241,0.16),transparent_60%)]" />
      <main className="login-enter relative mx-auto grid w-full max-w-[1060px] overflow-hidden rounded-[28px] border bg-white shadow-[0_24px_80px_-36px_rgba(30,41,59,0.3)] lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="relative overflow-hidden bg-slate-950 p-8 text-white sm:p-10 lg:p-12">
          <div aria-hidden="true" className="login-grid pointer-events-none absolute inset-0 opacity-15" />
          <div className="relative">
            <Link href="/login" className="group inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition hover:text-white"><ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />Back to sign in</Link>
            <span className="mt-12 grid size-11 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-950"><UserRoundPlus className="size-5" /></span>
            <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-300">One-time workspace setup</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.04em]">Create the first administrator.</h1>
            <p className="mt-4 text-sm leading-7 text-slate-400">This account receives full access to configure employees, payroll, benefits, claims, and roles.</p>
            <div className="mt-9 space-y-4 border-t border-white/10 pt-7">{[
              "Requires your private setup token",
              "Creates a confirmed Supabase Auth user",
              "Creates the matching super_admin profile",
              "Closes permanently after the first admin",
            ].map((item) => <p key={item} className="flex items-start gap-3 text-xs leading-5 text-slate-300"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="size-3" /></span>{item}</p>)}</div>
          </div>
        </aside>

        <section className="p-6 sm:p-10 lg:p-12" aria-labelledby="setup-form-title">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><ShieldCheck className="size-5" /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-600">Secure bootstrap</p><h2 id="setup-form-title" className="mt-1 text-xl font-semibold">Administrator credentials</h2></div></div>

          {complete ? (
            <div className="login-enter mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><span className="grid size-10 place-items-center rounded-full bg-emerald-100 text-emerald-700"><BadgeCheck className="size-5" /></span><h3 className="mt-4 font-semibold text-emerald-950">Administrator ready</h3><p role="status" className="mt-2 text-sm leading-6 text-emerald-800">{state.success}</p><Button asChild className="mt-6 h-11 w-full"><Link href="/login">Continue to sign in<ArrowRight /></Link></Button></div>
          ) : (
            <form action={action} aria-busy={pending} className="mt-7 space-y-5">
              <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-700">First name<Input name="firstName" autoComplete="given-name" required maxLength={100} className="mt-2 h-11" /></label>
                <label className="text-xs font-medium text-slate-700">Last name<Input name="lastName" autoComplete="family-name" required maxLength={100} className="mt-2 h-11" /></label>
                <label className="text-xs font-medium text-slate-700">Employee number<Input name="employeeNumber" placeholder="ADMIN-001" required pattern="[A-Z0-9_-]{2,32}" title="Use uppercase letters, numbers, underscores or hyphens." className="mt-2 h-11 uppercase" /></label>
                <label className="text-xs font-medium text-slate-700">Email<Input name="email" type="email" autoComplete="username" required maxLength={254} placeholder="admin@company.com" className="mt-2 h-11" /></label>
                <label className="text-xs font-medium text-slate-700 sm:col-span-2">Password<div className="relative mt-2"><Input name="password" type={showSecrets ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} className="h-11 pr-11" /><button type="button" onClick={() => setShowSecrets((value) => !value)} aria-label={showSecrets ? "Hide setup credentials" : "Show setup credentials"} className="absolute right-1 top-0.5 grid size-10 place-items-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-indigo-600">{showSecrets ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div><span className="mt-1.5 block text-[10px] font-normal leading-4 text-slate-400">Use at least 12 characters.</span></label>
                <label className="text-xs font-medium text-slate-700 sm:col-span-2">Confirm password<Input name="confirmPassword" type={showSecrets ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} className="mt-2 h-11" /></label>
                <label htmlFor="setup-token" className="text-xs font-medium text-slate-700 sm:col-span-2">Private setup token<div className="relative mt-2"><KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input id="setup-token" name="setupToken" aria-label="Private setup token" type={showSecrets ? "text" : "password"} autoComplete="off" required className="h-11 pl-10" /></div><span className="mt-1.5 block text-[10px] font-normal leading-4 text-slate-400">The value of <code>ADMIN_SETUP_TOKEN</code> from the server environment.</span></label>
              </fieldset>
              {state.error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700"><CircleAlert className="mt-0.5 size-4 shrink-0" />{state.error}</p>}
              <Button type="submit" disabled={pending} className="h-12 w-full rounded-xl font-semibold">{pending ? <><LoaderCircle className="animate-spin" />Creating administrator…</> : <><LockKeyhole />Create first administrator</>}</Button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
