import Link from "next/link";
import { redirect } from "next/navigation";
import { MfaShell } from "@/components/auth/mfa-shell";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { WorkspaceSession } from "@/types/payroll";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage() {
  if (!hasSupabaseEnvironment()) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data, error } = await db.rpc("workspace_session", {});
  const workspace = data as unknown as WorkspaceSession | null;
  if (error || !workspace?.active || !workspace.roles.length) redirect("/login?reason=access_disabled");

  return <MfaShell eyebrow="Account security" title="Email verification at sign-in." description="For privileged roles, enter your password and then verify a one-time code sent to your registered work email. No authenticator app is needed for this sign-in step.">
    <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">The code is single-use and expires after 90 seconds. If it expires, request a new one from the sign-in verification page.</p>
    <Button asChild variant="secondary" className="mt-5 w-full"><Link href="/settings/profile">Back to profile & security</Link></Button>
  </MfaShell>;
}
