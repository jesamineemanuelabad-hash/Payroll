import { z } from "zod";
import { entities } from "./config";

export function recordSchema(entity: string, creating: boolean) {
  const config = entities[entity];
  if (!config) throw new Error("Unknown record type.");
  const shape: Record<string, z.ZodType> = {};
  for (const field of config.fields) {
    if (field.createOnly && !creating) continue;
    let schema: z.ZodType;
    if (field.type === "number") {
      let number = z.number().finite().max(999999999, "Amount is too large.");
      if (field.min !== undefined) number = number.min(field.min);
      if (field.key.endsWith("_minutes")) number = number.int();
      schema = number;
    } else if (field.type === "checkbox") schema = z.boolean();
    else if (field.reference || field.key === "id") schema = z.string().uuid();
    else if (field.options) schema = z.enum(field.options as [string, ...string[]]);
    else if (field.type === "date") schema = z.string().date();
    else if (field.type === "datetime-local") schema = z.string().datetime({ offset: true });
    else if (field.type === "email") schema = z.string().trim().email().max(254);
    else if (field.key === "receipt_url") schema = z.string().url().startsWith("https://").max(2000);
    else if (field.key === "code") schema = z.string().regex(/^[A-Z0-9_-]{2,16}$/, "Use 2–16 uppercase letters, numbers, underscores or hyphens.");
    else schema = z.string().trim().min(1, `${field.label} is required.`).max(field.type === "textarea" ? 4000 : 250);
    shape[field.key] = field.required || field.type === "checkbox" ? schema : schema.nullable();
  }
  return z.object(shape).strict().superRefine((data, ctx) => {
    const values = data as Record<string, unknown>;
    const pairs = [["period_start", "period_end"], ["starts_on", "ends_on"], ["effective_from", "effective_to"], ["effective_date", "expiration_date"], ["start_date", "end_date"], ["time_in", "time_out"]];
    for (const [start, end] of pairs) {
      if (values[start] && values[end] && new Date(String(values[end])) < new Date(String(values[start]))) ctx.addIssue({ code: "custom", path: [end], message: "Must be on or after the start." });
    }
    if (entity === "payroll_runs") {
      if (String(values.pay_date) < String(values.period_end)) ctx.addIssue({ code: "custom", path: ["pay_date"], message: "Pay date cannot be before the period end." });
      const start = new Date(`${values.period_start}T00:00:00Z`);
      const end = new Date(`${values.period_end}T00:00:00Z`);
      const monthEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
      const valid = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth() &&
        ((start.getUTCDate() === 1 && end.getUTCDate() === 15) || (start.getUTCDate() === 16 && end.getUTCDate() === monthEnd) || (start.getUTCDate() === 1 && end.getUTCDate() === monthEnd));
      if (!valid) ctx.addIssue({ code: "custom", path: ["period_end"], message: "Use the 1st–15th, 16th–month end, or a complete calendar month." });
    }
    if (entity === "claims") {
      if (Number(values.requested_amount) <= 0) ctx.addIssue({ code: "custom", path: ["requested_amount"], message: "Requested amount must be greater than zero." });
      if (Number(values.approved_amount) < 0) ctx.addIssue({ code: "custom", path: ["approved_amount"], message: "Approved amount cannot be negative." });
      if (Number(values.approved_amount) > Number(values.requested_amount)) ctx.addIssue({ code: "custom", path: ["approved_amount"], message: "Approved amount cannot exceed the requested amount." });
      if (values.status === "rejected" && !values.rejection_reason) ctx.addIssue({ code: "custom", path: ["rejection_reason"], message: "A rejection reason is required." });
      if ((values.status === "approved" || values.verification_status === "verified") && !values.receipt_url) ctx.addIssue({ code: "custom", path: ["receipt_url"], message: "A supporting document is required before verification or approval." });
      if (values.status === "approved" && values.verification_status !== "verified") ctx.addIssue({ code: "custom", path: ["verification_status"], message: "Verify the supporting document first." });
    }
    if (entity === "payroll_items") {
      const gross = ["basic_salary", "allowances", "overtime", "attendance_adjustments", "benefits", "reimbursements"].reduce((sum, key) => sum + Number(values[key] ?? 0), 0);
      if (gross < Number(values.deductions)) ctx.addIssue({ code: "custom", path: ["deductions"], message: "Deductions cannot exceed gross earnings." });
    }
    if (entity === "leave_requests") {
      if (Number(values.total_days) <= 0) ctx.addIssue({ code: "custom", path: ["total_days"], message: "Total days must be greater than zero." });
      if (values.status === "rejected" && !values.rejection_reason) ctx.addIssue({ code: "custom", path: ["rejection_reason"], message: "A rejection reason is required." });
    }
  });
}
