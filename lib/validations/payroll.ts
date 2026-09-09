import { z } from "zod";

export const createPayrollRunSchema = z
  .object({
    periodStart: z.string().min(1, "Select the start of the payroll period."),
    periodEnd: z.string().min(1, "Select the end of the payroll period."),
    payDate: z.string().min(1, "Select a payment date."),
    includeActiveEmployees: z.boolean(),
  })
  .refine((values) => new Date(values.periodEnd) >= new Date(values.periodStart), {
    message: "The end date must be on or after the start date.",
    path: ["periodEnd"],
  })
  .refine((values) => new Date(values.payDate) >= new Date(values.periodEnd), {
    message: "The payment date cannot be before the payroll period ends.",
    path: ["payDate"],
  })
  .superRefine((values, ctx) => {
    const start = new Date(`${values.periodStart}T00:00:00Z`);
    const end = new Date(`${values.periodEnd}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    const valid = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth() &&
      ((start.getUTCDate() === 1 && end.getUTCDate() === 15) || (start.getUTCDate() === 16 && end.getUTCDate() === monthEnd) || (start.getUTCDate() === 1 && end.getUTCDate() === monthEnd));
    if (!valid) ctx.addIssue({ code: "custom", path: ["periodEnd"], message: "Use the 1st–15th, 16th–month end, or a complete calendar month." });
  });

export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
