import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RecordPage } from "@/components/records/record-page";
import { PayrollRunActions } from "@/components/payroll/payroll-run-actions";
import { readRecords } from "@/app/actions/records";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";
import type { PayrollStatus } from "@/types/payroll";

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  let run: { status: PayrollStatus; calculated_at: string | null; employee_count: number } = { status: "draft", calculated_at: null, employee_count: 0 };
  let roles: string[] = [];
  if (hasSupabaseEnvironment()) {
    const result = await readRecords({ entity: "payroll_runs", id });
    if (!result.ok) throw new Error(result.message);
    if (!result.data.rows.length) notFound();
    run = result.data.rows[0] as unknown as typeof run;
    const db = await createSupabaseServerClient();
    const roleResult = await db.rpc("record_roles", {});
    roles = roleResult.data ?? [];
  }
  return <div><Link href="/payroll-benefits/payroll" className="text-sm font-medium text-indigo-600">← Back to payroll runs</Link><PayrollRunActions runId={id} status={run.status} calculatedAt={run.calculated_at} employeeCount={run.employee_count} roles={roles} /><RecordPage entityKeys={["payroll_items"]} parent={id} /></div>;
}
