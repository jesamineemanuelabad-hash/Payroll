import { redirect } from "next/navigation";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { MfaShell } from "@/components/auth/mfa-shell";
import { mfaDestination, safeMfaReturnPath } from "@/lib/auth/mfa";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasSupabaseEnvironment()) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const next = safeMfaReturnPath((await searchParams).next);
  const [{ data: assurance, error: assuranceError }, { data: session, error: sessionError }] = await Promise.all([
    db.auth.mfa.getAuthenticatorAssuranceLevel(),
    db.rpc("workspace_session", {}),
  ]);
  if (assuranceError || sessionError || !assurance) redirect("/login?reason=security_check_failed");
  const workspace = session as { active?: boolean; roles?: string[]; email?: string; emailMfaVerified?: boolean; mfaRequired?: boolean; } | null;
  if (!workspace?.active || !workspace.roles?.length || !auth.user.email) redirect("/login?reason=access_disabled");
  const destination = mfaDestination(workspace.roles, workspace.emailMfaVerified ?? false, assurance, next);
  if (!destination) redirect(next);
  return <MfaShell eyebrow="Email verification" title="Check your work email." description="Your password was accepted. Confirm you can access your registered email before opening the protected workspace."><MfaChallengeForm email={auth.user.email} next={next}/></MfaShell>;
}
