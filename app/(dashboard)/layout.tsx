import { DashboardShell } from "@/components/dashboard-shell";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import { mfaDestination } from "@/lib/auth/mfa";
import type { WorkspaceSession } from "@/types/payroll";

// Authentication and configuration must be checked per request, including after deployment.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let email: string | undefined;
  let initials: string | undefined;
  let userName: string | undefined;
  let roles: string[] = [];
  if (hasSupabaseEnvironment()) {
    const db = await createSupabaseServerClient();
    const { data } = await db.auth.getUser();
    if (!data.user) redirect("/login");
    const { data: session, error } = await db.rpc("workspace_session", {});
    const workspace = session as unknown as WorkspaceSession | null;
    if (error || !workspace?.active || !workspace.roles.length) redirect("/login?reason=access_disabled");
    const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || !assurance) redirect("/login?reason=security_check_failed");
    const securityDestination = mfaDestination(workspace.roles, assurance);
    if (securityDestination) redirect(securityDestination);
    email = workspace.email ?? data.user.email;
    userName = [workspace.firstName, workspace.lastName].filter(Boolean).join(" ") || undefined;
    initials = `${workspace.firstName?.[0] ?? ""}${workspace.lastName?.[0] ?? ""}`.toUpperCase() || email?.slice(0, 2).toUpperCase();
    roles = workspace.roles;
  }
  return <DashboardShell userEmail={email} userName={userName} userInitials={initials} roles={roles}>{children}</DashboardShell>;
}
