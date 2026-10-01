import { z } from "zod";

const count = z.coerce.number().int().nonnegative();
const amount = z.coerce.number().finite().nonnegative();

export const hrAnalyticsFiltersSchema = z.object({
  months: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(12),
  departmentId: z.string().uuid().nullable().default(null),
  location: z.string().trim().min(1).max(120).nullable().default(null),
  employmentType: z.string().trim().min(1).max(50).nullable().default(null),
}).strict();

export const hrAnalyticsSnapshotSchema = z.object({
  generatedAt: z.string(),
  options: z.object({
    departments: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    locations: z.array(z.string()),
    employmentTypes: z.array(z.string()),
  }),
  summary: z.object({
    headcount: count,
    activeEmployees: count,
    employeesOnLeave: count,
    newHires: count,
    averageTenureMonths: amount,
    employeesWithHireDate: count,
    activeBenefits: count,
  }),
  headcountByDepartment: z.array(z.object({ name: z.string(), count })),
  employmentMix: z.array(z.object({ type: z.string(), count })),
  hiringTrend: z.array(z.object({ month: z.string(), label: z.string(), count })),
  tenureBands: z.array(z.object({ label: z.string(), count })),
  attendance: z.object({
    total: count,
    lateMinutes: count,
    absenceMinutes: count,
    classes: z.array(z.object({ classification: z.string(), count })),
  }),
  leave: z.object({
    submittedRequests: count,
    approvedRequests: count,
    rejectedRequests: count,
    approvedDays: amount,
    submittedDays: amount,
    byType: z.array(z.object({ type: z.string(), approvedDays: amount, submittedDays: amount })),
  }),
  compensationBands: z.array(z.object({ label: z.string(), count })),
});

export type HrAnalyticsFilters = z.infer<typeof hrAnalyticsFiltersSchema>;
export type HrAnalyticsSnapshot = z.infer<typeof hrAnalyticsSnapshotSchema>;
