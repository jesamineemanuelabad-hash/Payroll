import { redirect } from "next/navigation";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { MfaShell } from "@/components/auth/mfa-shell";
import { safeMfaReturnPath } from "@/lib/auth/mfa";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!hasSupabaseEnvironment()) redirect("/login");
  const db = await createSupabaseServerClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const next = safeMfaReturnPath((await searchParams).next);
  const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
    db.auth.mfa.getAuthenticatorAssuranceLevel(),
    db.auth.mfa.listFactors(),
  ]);
  if (assuranceError || factorsError || !assurance) redirect("/login?reason=security_check_failed");
  if (assurance.currentLevel === "aal2") redirect(next);
  const verified = (factors?.totp ?? []).map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? "Authenticator app" }));
  if (!verified.length) redirect("/mfa/setup");
  return <MfaShell eyebrow="Identity verification" title="Enter your security code." description="Your password was accepted. Complete the second verification step to open the protected payroll workspace."><MfaChallengeForm factors={verified} next={next}/></MfaShell>;
}
