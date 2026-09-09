import { CheckCircle2, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { MfaEnrollment } from "@/components/auth/mfa-enrollment";
import { MfaFactorList } from "@/components/auth/mfa-factor-list";
import { MfaShell } from "@/components/auth/mfa-shell";
import { requiresMfa } from "@/lib/auth/mfa";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { WorkspaceSession } from "@/types/payroll";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage({ searchParams }: { searchParams: Promise<{ removed?: string }> }) {
  if (!hasSupabaseEnvironment()) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: session }, { data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
    db.rpc("workspace_session", {}),
    db.auth.mfa.getAuthenticatorAssuranceLevel(),
    db.auth.mfa.listFactors(),
  ]);
  const workspace = session as unknown as WorkspaceSession | null;
  if (!workspace?.active || !workspace.roles.length) redirect("/login?reason=access_disabled");
  if (assuranceError || factorsError || !assurance) redirect("/login?reason=security_check_failed");
  const verified = factors?.totp ?? [];
  if (verified.length && assurance.currentLevel !== "aal2") redirect("/mfa/challenge?next=%2Fmfa%2Fsetup");
  const required = workspace.mfaRequired ?? requiresMfa(workspace.roles);
  const removed = (await searchParams).removed === "1";

  if (!verified.length) {
    return <MfaShell eyebrow={required ? "Required security setup" : "Account security"} title="Protect your account with MFA." description={required ? "Your administrative role handles sensitive payroll and employee data, so an authenticator is required before you can use the workspace." : "Add an authenticator app as a second verification step for your account."}>{removed&&<p className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">Authenticator removed.</p>}<MfaEnrollment/></MfaShell>;
  }

  return <MfaShell eyebrow="Account security" title="Multi-factor authentication is active." description="Your account is protected with a password and a time-based code from your authenticator app.">
    <div className="mb-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600"/><div><p className="text-sm font-semibold text-emerald-950">Security requirement satisfied</p><p className="mt-1 text-xs leading-5 text-emerald-700">This session has completed second-factor verification.</p></div></div>
    {verified.length===1&&<div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600"/><p className="text-xs leading-5 text-amber-800">Supabase does not provide recovery codes. Add a second authenticator as a backup before replacing your current device.</p></div>}
    <MfaFactorList required={required} factors={verified.map((factor)=>({id:factor.id,name:factor.friendly_name??"Authenticator app",createdAt:factor.created_at}))}/>
    <div className="mt-6 border-t border-slate-100 pt-6"><h2 className="text-sm font-semibold text-slate-900">Backup authenticator</h2><p className="mt-1 text-xs leading-5 text-slate-500">Register a second trusted device to reduce account lockout risk.</p><div className="mt-4"><MfaEnrollment addAnother/></div></div>
  </MfaShell>;
}
