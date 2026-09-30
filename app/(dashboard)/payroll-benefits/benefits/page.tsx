import { HmoBenefitsWorkspace } from "@/components/benefits/hmo-benefits-workspace";
import { readHmoBenefits } from "@/app/actions/hmo";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export default async function Page() {
  const configured = hasSupabaseEnvironment();
  let canManage = false;
  let initialSnapshot = null;
  let initialError = "";
  if (configured) {
    const db = await createSupabaseServerClient();
    const { data: roles, error } = await db.rpc("record_roles", {});
    if (error) {
      initialError = "Could not verify HR access. Refresh the page or contact an administrator.";
    } else {
      canManage = Boolean(roles?.some((role) => ["super_admin", "hr_admin"].includes(role)));
    }
    if (canManage && !error) {
      const result = await readHmoBenefits();
      if (result.ok) initialSnapshot = result.data;
      else initialError = result.message;
    }
  }
  return <HmoBenefitsWorkspace
    configured={configured}
    canManage={canManage}
    initialSnapshot={initialSnapshot}
    initialError={initialError}
  />;
}
