import { z } from "zod";

const money = z.coerce.number().finite();
const count = z.coerce.number().int().nonnegative();

export const dashboardFiltersSchema = z.object({
  months: z.union([z.literal(3), z.literal(6), z.literal(12)]).default(12),
  departmentId: z.string().uuid().nullable().default(null),
  location: z.string().trim().min(1).max(120).nullable().default(null),
  employmentType: z.string().trim().min(1).max(50).nullable().default(null),
}).strict();

export const liveDashboardSchema = z.object({
  generatedAt: z.string(),
  lastSyncAt: z.string().nullable(),
  options: z.object({
    departments: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    locations: z.array(z.string()),
    employmentTypes: z.array(z.string()),
  }),
  summary: z.object({
    employeeCount: count,
    currentNet: money,
    currentGross: money,
    currentBenefits: money,
    currentContributions: money,
    averageCompensation: money,
    openActions: count,
  }),
  trend: z.array(z.object({
    month: z.string(), label: z.string(), net: money, gross: money,
    benefits: money, contributions: money, baseSalary: money,
    allowances: money, overtime: money,
  })),
  departments: z.array(z.object({ id: z.string().uuid(), name: z.string(), employees: count, cost: money })),
  readiness: z.object({
    id: z.string().uuid(), periodStart: z.string(), periodEnd: z.string(), payDate: z.string(),
    status: z.enum(["draft", "processing", "pending_approval", "approved", "paid", "failed"]),
    employeeCount: count, net: money, exceptions: count, progress: count,
  }).nullable(),
  tasks: z.array(z.object({ type: z.enum(["payroll", "claims", "benefits", "attendance"]), count, amount: money })),
  activity: z.array(z.object({
    id: z.coerce.number(), action: z.string(), entityType: z.string(), entityId: z.string(),
    created_at: z.string(), actor: z.string(),
  })),
  attendance: z.object({
    total: count,
    classes: z.array(z.object({ classification: z.string(), count })),
    daily: z.array(z.object({ date: z.string(), score: money.nullable(), total: count })),
  }),
  model: z.object({
    id: z.string().uuid(), name: z.string(), version: z.string(), recordsScored: count,
    validationAccuracy: money.nullable(), completedAt: z.string().nullable(),
  }).nullable(),
  anomalies: z.array(z.object({
    id: z.string().uuid(), employee: z.string(), predictedClass: z.string(),
    classProbability: money, anomalyScore: money, reasons: z.array(z.string()), reviewedAt: z.string().nullable(),
  })),
  compensationBands: z.array(z.object({ band: z.string(), employees: count })),
  costMix: z.object({ baseSalary: money, allowances: money, overtime: money, benefits: money, contributions: money }),
  drivers: z.object({ overtime: money, claims: money, newHires: count }),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;
export type LiveDashboardData = z.infer<typeof liveDashboardSchema>;
