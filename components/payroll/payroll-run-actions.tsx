"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Printer, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { calculatePayrollRun, transitionPayrollRun, validatePayrollRun } from "@/app/actions/payroll";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { PayrollStatus } from "@/types/payroll";

const pretty = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const statusLabel = (status: PayrollStatus) => status === "pending_approval" ? "Waiting for Finance review" : status === "approved" ? "Pending disbursement" : status === "paid" ? "Payment recorded" : pretty(status);

export function PayrollRunActions({ runId, status, calculatedAt, employeeCount, validationStatus, roles }: { runId: string; status: PayrollStatus; calculatedAt: string | null; employeeCount: number; validationStatus?: string; roles: string[] }) {
  const [busy, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<"draft" | "pending_approval" | null>(null);
  const router = useRouter();
  const canCalculate = roles.some((role) => ["super_admin", "payroll_manager"].includes(role));
  function calculate() { startTransition(async () => { const result = await calculatePayrollRun(runId); if (!result.ok) { toast.error("Payroll calculation failed", { description: result.message }); return; } toast.success("Payroll calculated", { description: `${result.employees} employees · ${result.ruleVersion}` }); router.refresh(); }); }
  function validate() { startTransition(async () => { const result = await validatePayrollRun(runId); if (!result.ok) { toast.error("Payroll validation failed", { description: result.message }); return; } const failures = result.data.issues.filter((issue) => issue.severity === "error").length + result.data.comparisons.filter((item) => !item.passed).length; if (failures) toast.error("Validation needs attention", { description: `${failures} blocking issue(s) found.` }); else toast.success("Payroll validation passed", { description: `${result.data.comparisons.length} historical comparison case(s) checked.` }); router.refresh(); }); }
  function transition(target: "draft" | "pending_approval") { startTransition(async () => { const result = await transitionPayrollRun(runId, target); if (!result.ok) { toast.error("Payroll workflow update failed", { description: result.message }); return; } toast.success(target === "draft" ? "Payroll recalled to draft" : "Payroll sent for Finance review"); setConfirmation(null); router.refresh(); }); }
  return <div className="mt-4 flex flex-wrap gap-2 rounded-xl border bg-white p-4">
    <div className="mb-2 basis-full"><p className="text-sm font-semibold text-slate-900">Payroll workflow</p><p className="mt-1 text-xs text-slate-500">Status: <span className="font-medium text-indigo-700">{statusLabel(status)}</span>{calculatedAt ? ` · calculated ${new Date(calculatedAt).toLocaleString()}` : " · not calculated"} · validation <span className={validationStatus === "passed" ? "font-medium text-emerald-700" : validationStatus === "failed" ? "font-medium text-red-700" : "font-medium text-amber-700"}>{pretty(validationStatus ?? "not_run")}</span> · {employeeCount} employees</p></div>
    {status === "draft" && canCalculate && <Button onClick={calculate} disabled={busy}><Calculator className={busy ? "animate-pulse" : ""} />{busy ? "Working…" : calculatedAt ? "Recalculate payroll" : "Calculate payroll"}</Button>}
    {status === "draft" && calculatedAt && <Button variant="secondary" onClick={validate} disabled={busy}><ShieldCheck />Validate payroll</Button>}
    {status === "draft" && canCalculate && <Button variant="secondary" onClick={() => setConfirmation("pending_approval")} disabled={busy || !calculatedAt || employeeCount === 0 || validationStatus !== "passed"}><Send />Send to Finance</Button>}
    {status === "pending_approval" && roles.some((role) => ["super_admin", "hr_admin", "payroll_manager"].includes(role)) && <Button variant="secondary" onClick={() => setConfirmation("draft")} disabled={busy}><RotateCcw />Recall to draft</Button>}
    <Button variant="secondary" asChild><Link href={`/payroll-benefits/payroll/${runId}/print`} target="_blank"><Printer />Print payroll & payslips</Link></Button>
    <p className="basis-full text-xs leading-5 text-slate-500">Calculation uses effective company policy and includes paid leave, categorized overtime, night differential, SSS, PhilHealth, Pag-IBIG, BIR withholding, benefits, reimbursements, and bonuses. Validation must pass before handoff. Finance handles approval and payment outside this system.</p>
    <Dialog open={confirmation !== null} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}>
      <DialogContent>
        <DialogTitle>{confirmation === "pending_approval" ? "Send payroll to Finance?" : "Recall payroll to draft?"}</DialogTitle>
        <DialogDescription>{confirmation === "pending_approval" ? "The validated payroll will be marked as waiting for Finance review. This system does not approve payroll or disburse funds." : "This returns the payroll to draft so it can be revised and recalculated before another Finance handoff."}</DialogDescription>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busy} onClick={() => confirmation && transition(confirmation)}>{busy ? "Saving…" : confirmation === "pending_approval" ? "Confirm handoff" : "Confirm recall"}</Button></div>
      </DialogContent>
    </Dialog>
  </div>;
}
