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
  .refine((values) => new Date(values.payDate) > new Date(values.periodEnd), {
    message: "The payment date must be after the payroll period.",
    path: ["payDate"],
  });

export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;
