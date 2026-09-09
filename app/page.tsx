import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { WorkspaceSession } from "@/types/payroll";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payroll & Benefits — Connected Payroll Operations",
  description: "Connect employee data, attendance, payroll, compensation, benefits, claims, and predictive HR analytics in one secure operating system.",
};

export default async function HomePage() {
  let isAuthenticated = false;
  if (hasSupabaseEnvironment()) {
    const db = await createSupabaseServerClient();
    const { data } = await db.auth.getUser();
    if (data.user) {
      const { data: session } = await db.rpc("workspace_session", {});
      const workspace = session as unknown as WorkspaceSession | null;
      isAuthenticated = Boolean(workspace?.active && workspace.roles.length);
    }
  }
  return <LandingPage isAuthenticated={isAuthenticated} />;
}
