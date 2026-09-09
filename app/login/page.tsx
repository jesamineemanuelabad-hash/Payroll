"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronDown, CircleAlert, Clock3,
  Eye, EyeOff, Fingerprint, HeartPulse, LoaderCircle, LockKeyhole, Mail,
  ShieldCheck, Sparkles, UsersRound, WalletCards,
} from "lucide-react";
import { signIn } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const previews = [
  { name: "People", icon: UsersRound, title: "Start with your people.", description: "Employee profiles, attendance, and salary history stay organized in one place.", metric: "248", label: "Active employees", change: "+4 this month", rows: [["Attendance synced", "97.6%"], ["Profiles complete", "96.8%"], ["Needs attention", "3"]], bars: [48, 63, 58, 76, 68, 84, 78, 91] },
  { name: "Payroll", icon: WalletCards, title: "Make payroll feel clear.", description: "Review each input, spot exceptions, and move every run forward with confidence.", metric: "₱6.30M", label: "Net payroll", change: "248 employees", rows: [["Employee entries", "248 / 248"], ["Ready for approval", "75%"], ["Exceptions", "3"]], bars: [42, 55, 51, 68, 61, 77, 72, 88] },
  { name: "Benefits", icon: HeartPulse, title: "Take care of the details.", description: "Plans, enrollments, and claims move through a simple, visible review process.", metric: "231", label: "Employees enrolled", change: "93.1% coverage", rows: [["Active HMO plans", "4"], ["Claims ready", "8"], ["Eligibility review", "7"]], bars: [39, 48, 58, 55, 70, 73, 82, 89] },
];

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, { error: "" });
  const [preview, setPreview] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const selected = previews[preview];
  const SelectedIcon = selected.icon;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-white text-slate-950">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-1/3 size-[440px] rounded-full bg-indigo-100/60 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-80 w-2/3 bg-[radial-gradient(circle_at_80%_0%,rgba(99,102,241,0.10),transparent_62%)]" />

      <header className="relative z-10 mx-auto flex h-20 w-full max-w-[1280px] items-center justify-end px-5 sm:h-24 sm:px-8 lg:px-10">
        <Link href="/" className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3.5 py-2 text-xs font-medium text-slate-500 shadow-sm backdrop-blur transition hover:border-indigo-200 hover:text-indigo-600"><ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none" />Back to home</Link>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1280px] items-center gap-12 px-5 pb-10 sm:px-8 lg:min-h-[calc(100dvh-96px)] lg:grid-cols-[1.22fr_0.78fr] lg:gap-16 lg:px-10 lg:pb-16 xl:gap-24">
        <section className="login-enter mx-auto w-full max-w-[420px] py-8 lg:order-2 lg:py-12" aria-labelledby="login-title">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1.5 text-[11px] font-semibold text-indigo-700"><Sparkles className="size-3.5" />Payroll & Benefits workspace</div>
          <h1 id="login-title" className="mt-7 text-[42px] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-5xl">Welcome back.</h1>
          <p className="mt-4 max-w-sm text-[15px] leading-7 text-slate-500">Sign in to continue managing your organization’s people, payroll, benefits, and claims.</p>

          <form action={action} aria-busy={pending} className="mt-9 space-y-5">
            <div><label htmlFor="login-email" className="text-sm font-medium text-slate-700">Work email</label><div className="group relative mt-2"><Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-600" /><Input id="login-email" className="h-[52px] rounded-xl border-slate-200 bg-white pl-11 text-base shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus:border-indigo-400 sm:text-sm" name="email" type="email" autoComplete="username" inputMode="email" placeholder="you@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} readOnly={pending} aria-describedby={state.error ? "login-error" : undefined} /></div></div>
            <div><div className="flex items-center justify-between"><label htmlFor="login-password" className="text-sm font-medium text-slate-700">Password</label><span className="text-[11px] text-slate-400">Organization account</span></div><div className="group relative mt-2"><LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-600" /><Input id="login-password" className="h-[52px] rounded-xl border-slate-200 bg-white pl-11 pr-12 text-base shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus:border-indigo-400 sm:text-sm" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(event) => setPassword(event.target.value)} readOnly={pending} onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))} onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)} aria-describedby={[capsLock ? "caps-lock-hint" : "", state.error ? "login-error" : ""].filter(Boolean).join(" ") || undefined} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute right-1.5 top-1.5 grid size-10 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-indigo-600">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{capsLock && <p id="caps-lock-hint" role="status" className="mt-2 text-xs text-amber-700">Caps Lock is on.</p>}</div>
            {state.error && <p id="login-error" role="alert" className="login-enter flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3.5 text-xs leading-5 text-red-700"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{state.error}</p>}
            <Button type="submit" disabled={pending} className="group h-[52px] w-full rounded-xl text-sm font-semibold shadow-[0_8px_24px_-10px_rgba(79,70,229,0.75)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(79,70,229,0.8)] active:translate-y-0 motion-reduce:transform-none">{pending ? <><LoaderCircle className="animate-spin" />Signing in…</> : <>Sign in to workspace<ArrowRight className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" /></>}</Button>
          </form>

          <details className="group mt-5 rounded-xl border border-transparent transition open:border-slate-200 open:bg-slate-50/70"><summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-500 transition hover:text-indigo-600 [&::-webkit-details-marker]:hidden">Need help signing in?<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></summary><div className="px-4 pb-4 text-xs leading-6 text-slate-500">Use the account created by your HR or workspace administrator. Ask them to confirm your account or reset your password if you cannot sign in.</div></details>
          <div className="mt-8 flex items-center gap-5 border-t border-slate-100 pt-6 text-[11px] text-slate-400"><span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-emerald-500" />Role-based access</span><span className="flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-indigo-500" />Audited records</span></div>
        </section>

        <aside className="login-enter relative hidden min-h-[640px] overflow-hidden rounded-[32px] border border-indigo-100 bg-[#f2f4ff] p-8 lg:order-1 lg:block xl:p-11" aria-label="Explore the workspace" style={{ animationDelay: "100ms" }}>
          <div aria-hidden="true" className="login-grid pointer-events-none absolute inset-0 opacity-45" /><div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-indigo-300/25 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-8"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">A calmer workday</p><h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight tracking-[-0.04em] text-slate-950">Everything your team needs, ready when they sign in.</h2></div><span className="flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-[10px] font-semibold text-indigo-700 shadow-sm">Interface preview</span></div>
            <div className="mt-8 flex w-fit rounded-xl border border-indigo-100 bg-white/60 p-1 shadow-sm backdrop-blur" aria-label="Preview modules">{previews.map((item, index) => { const Icon = item.icon; return <button key={item.name} type="button" aria-pressed={preview === index} onClick={() => setPreview(index)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium transition-all ${preview === index ? "bg-slate-950 text-white shadow-md" : "text-slate-500 hover:bg-white hover:text-slate-900"}`}><Icon className="size-3.5" />{item.name}</button>; })}</div>

            <div className="login-preview-float mt-7 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_70px_-32px_rgba(30,41,59,0.4)]">
              <div className="flex h-11 items-center border-b bg-slate-50/70 px-4"><div className="flex gap-1.5" aria-hidden="true"><span className="size-2 rounded-full bg-red-300" /><span className="size-2 rounded-full bg-amber-300" /><span className="size-2 rounded-full bg-emerald-300" /></div><p className="mx-auto flex items-center gap-1.5 text-[9px] text-slate-400"><ShieldCheck className="size-3 text-emerald-500" />Secure operations workspace</p></div>
              <div key={preview} className="login-enter grid min-h-[330px] grid-cols-[138px_1fr]">
                <div className="border-r bg-slate-50/60 p-3"><div className="flex items-center gap-2 px-1"><span className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-[10px] font-bold text-white">PB</span><span className="text-[9px] font-semibold text-slate-800">Workspace</span></div><div className="mt-6 space-y-1">{previews.map((item, index) => { const Icon = item.icon; return <div key={item.name} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[8px] ${preview === index ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-400"}`}><Icon className="size-3" />{item.name}</div>; })}<div className="flex items-center gap-2 rounded-lg px-2 py-2 text-[8px] text-slate-400"><Fingerprint className="size-3" />Attendance</div></div></div>
                <div className="p-5"><div className="flex items-start justify-between"><div><p className="text-[8px] font-medium uppercase tracking-wide text-slate-400">Illustrative overview</p><h3 className="mt-1.5 text-base font-semibold text-slate-900">{selected.title}</h3><p className="mt-1 max-w-xs text-[9px] leading-4 text-slate-400">{selected.description}</p></div><span className="grid size-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><SelectedIcon className="size-4" /></span></div>
                  <div className="mt-5 grid grid-cols-[1fr_1.15fr] gap-3"><div className="rounded-xl border p-3"><p className="text-[8px] text-slate-400">{selected.label}</p><p className="mt-1 text-lg font-semibold text-slate-950">{selected.metric}</p><p className="mt-1 text-[8px] font-medium text-emerald-600">{selected.change}</p></div><div className="rounded-xl border p-3"><div className="flex h-[58px] items-end gap-1.5 border-b border-slate-100">{selected.bars.map((height, index) => <span key={index} className="chart-bar-y-animate flex-1 rounded-t bg-indigo-400" style={{ height: `${height}%`, animationDelay: `${index * 45}ms` }} />)}</div><p className="mt-2 text-[7px] text-slate-400">Last eight reporting periods</p></div></div>
                  <div className="mt-3 divide-y rounded-xl border px-3">{selected.rows.map(([label, value], index) => <div key={label} className="flex items-center gap-2 py-2.5"><span className={`grid size-5 place-items-center rounded-full ${index === 2 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>{index === 2 ? <Clock3 className="size-2.5" /> : <Check className="size-2.5" />}</span><span className="flex-1 text-[8px] text-slate-500">{label}</span><span className="text-[8px] font-semibold text-slate-700">{value}</span></div>)}</div>
                </div>
              </div>
            </div>
            <div className="login-float-card absolute -bottom-8 -right-3 flex items-center gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-xl" aria-hidden="true"><span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><BadgeCheck className="size-4" /></span><div><p className="text-[10px] font-semibold text-slate-800">Records are synchronized</p><p className="mt-0.5 text-[8px] text-slate-400">Everything is ready for review</p></div></div>
          </div>
        </aside>
      </main>
    </div>
  );
}
