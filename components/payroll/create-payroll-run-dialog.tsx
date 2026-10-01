"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, LoaderCircle, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { createPayrollRun } from "@/app/actions/payroll";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createPayrollRunSchema, getPayrollCutoffPeriod, type CreatePayrollRunInput, type PayrollCutoff } from "@/lib/validations/payroll";

export function CreatePayrollRunDialog() {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const initialMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const initialCutoff: PayrollCutoff = today.getDate() <= 15 ? "first" : "second";
  const initialPeriod = getPayrollCutoffPeriod(initialMonth, initialCutoff);
  const [month, setMonth] = useState(initialMonth);
  const [cutoff, setCutoff] = useState<PayrollCutoff>(initialCutoff);
  const visiblePeriod = getPayrollCutoffPeriod(month, cutoff);
  const form = useForm<CreatePayrollRunInput>({
    resolver: zodResolver(createPayrollRunSchema),
    defaultValues: { ...initialPeriod, payDate: initialPeriod.periodEnd, includeActiveEmployees: true },
  });

  function updateCycle(nextMonth: string, nextCutoff: PayrollCutoff) {
    const period = getPayrollCutoffPeriod(nextMonth, nextCutoff);
    setMonth(nextMonth);
    setCutoff(nextCutoff);
    form.setValue("periodStart", period.periodStart, { shouldValidate: true });
    form.setValue("periodEnd", period.periodEnd, { shouldValidate: true });
    form.setValue("payDate", period.periodEnd, { shouldValidate: true });
  }

  async function onSubmit(values: CreatePayrollRunInput) {
    const result = await createPayrollRun(values);
    if (!result.ok) {
      toast.error("Payroll run wasn’t created", { description: result.message });
      return;
    }
    setOpen(false);
    const period = getPayrollCutoffPeriod(month, cutoff);
    form.reset({ ...period, payDate: period.periodEnd, includeActiveEmployees: true });
    toast.success("Payroll run created", { description: result.demo ? "Demo mode: your draft is ready for review." : "The draft is ready for employee calculations." });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><CalendarDays />Create payroll run</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Create a payroll run</DialogTitle>
        <DialogDescription>Choose a cutoff and month. The payroll period is filled in automatically; you can review employees before submitting for approval.</DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="flex items-center gap-1 text-sm font-medium text-slate-800">Payroll month<span className="text-red-500" aria-label="required">*</span></span>
              <Input type="month" className="mt-1.5" value={month} onChange={(event) => { if (event.target.value) updateCycle(event.target.value, cutoff); }} required />
            </label>
            <label>
              <span className="flex items-center gap-1 text-sm font-medium text-slate-800">Cutoff<span className="text-red-500" aria-label="required">*</span></span>
              <select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" value={cutoff} onChange={(event) => updateCycle(month, event.target.value === "second" ? "second" : "first")}>
                <option value="first">First cutoff · 1st–15th</option>
                <option value="second">Second cutoff · 16th–month end</option>
              </select>
            </label>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 sm:col-span-2">
              <p className="text-xs font-medium text-indigo-900">Generated payroll period</p>
              <p className="mt-1 text-sm font-semibold text-indigo-950">{visiblePeriod.periodStart} – {visiblePeriod.periodEnd}</p>
            </div>
            <label className="sm:col-span-2">
              <span className="flex items-center gap-1 text-sm font-medium text-slate-800">Scheduled pay date<span className="text-red-500" aria-label="required">*</span></span>
              <Input type="date" className="mt-1.5" aria-invalid={Boolean(form.formState.errors.payDate)} {...form.register("payDate")} />
              {form.formState.errors.payDate ? (
                <span className="mt-1.5 block text-xs text-red-600">{form.formState.errors.payDate.message}</span>
              ) : (
                <span className="mt-1.5 block text-xs text-slate-500">Defaults to the cutoff end; adjust only if the Finance handoff uses another date.</span>
              )}
            </label>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <input type="checkbox" className="mt-0.5 size-4 rounded border-slate-300 accent-indigo-600" {...form.register("includeActiveEmployees")} />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800"><Users className="size-4 text-slate-500" />Include all active employees</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">New hires and terminated employees are validated against the selected period.</span>
            </span>
          </label>
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-5">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}
              {form.formState.isSubmitting ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
