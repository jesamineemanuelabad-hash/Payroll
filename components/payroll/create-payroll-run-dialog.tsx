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
import { createPayrollRunSchema, type CreatePayrollRunInput } from "@/lib/validations/payroll";

const fields: { name: "periodStart" | "periodEnd" | "payDate"; label: string; helper: string }[] = [
  { name: "periodStart", label: "Period start", helper: "First day included" },
  { name: "periodEnd", label: "Period end", helper: "Last day included" },
  { name: "payDate", label: "Payment date", helper: "When employees are paid" },
];

export function CreatePayrollRunDialog() {
  const [open, setOpen] = useState(false);
  const form = useForm<CreatePayrollRunInput>({
    resolver: zodResolver(createPayrollRunSchema),
    defaultValues: { periodStart: "2026-09-01", periodEnd: "2026-09-15", payDate: "2026-09-15", includeActiveEmployees: true },
  });

  async function onSubmit(values: CreatePayrollRunInput) {
    const result = await createPayrollRun(values);
    if (!result.ok) {
      toast.error("Payroll run wasn’t created", { description: result.message });
      return;
    }
    setOpen(false);
    form.reset();
    toast.success("Payroll run created", { description: result.demo ? "Demo mode: your draft is ready for review." : "The draft is ready for employee calculations." });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><CalendarDays />Create payroll run</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Create a payroll run</DialogTitle>
        <DialogDescription>Set the period and payment date. You can review employees and make adjustments before submitting for approval.</DialogDescription>
        <form className="mt-6 space-y-5" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field, index) => (
              <label key={field.name} className={index === 2 ? "sm:col-span-2" : ""}>
                <span className="flex items-center gap-1 text-sm font-medium text-slate-800">{field.label}<span className="text-red-500" aria-label="required">*</span></span>
                <Input type="date" className="mt-1.5" aria-invalid={Boolean(form.formState.errors[field.name])} {...form.register(field.name)} />
                {form.formState.errors[field.name] ? (
                  <span className="mt-1.5 block text-xs text-red-600">{form.formState.errors[field.name]?.message}</span>
                ) : (
                  <span className="mt-1.5 block text-xs text-slate-500">{field.helper}</span>
                )}
              </label>
            ))}
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
