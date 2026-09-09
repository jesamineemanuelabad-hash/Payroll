import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/actions/auth";

export function MfaShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-slate-50 px-5 py-10 text-slate-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.14),transparent_44%)]" />
      <div className="relative w-full max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <form action={signOut}><button className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-indigo-600"><ArrowLeft className="size-3.5" />Sign out</button></form>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700"><LockKeyhole className="size-3.5" />Protected session</span>
        </div>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_28px_80px_-42px_rgba(15,23,42,0.45)]">
          <div className="border-b border-slate-100 px-6 py-7 sm:px-8">
            <span className="grid size-11 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><ShieldCheck className="size-5" /></span>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-indigo-600">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
          </div>
          <div className="px-6 py-7 sm:px-8">{children}</div>
        </section>
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-400">Priority Handling Logistics, Inc. · Payroll & Benefits security</p>
      </div>
    </main>
  );
}
