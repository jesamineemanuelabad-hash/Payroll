import { z } from "zod";

export const essEmployeeSchema = z.object({
  externalId: z.string().min(1), employeeNumber: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1),
  email: z.string().email(), departmentCode: z.string().min(1), jobTitle: z.string().min(1), employmentStatus: z.enum(["active", "on_leave", "terminated"]),
  salary: z.number().nonnegative(), salaryEffectiveDate: z.string().date(), updatedAt: z.string().datetime(),
});

export const essAttendanceSchema = z.object({
  externalId: z.string().min(1), employeeNumber: z.string().min(1), attendanceDate: z.string().date(),
  timeIn: z.string().datetime().nullable(), timeOut: z.string().datetime().nullable(), approvedLeave: z.boolean().default(false), updatedAt: z.string().datetime(),
});

export const essApprovedRequestSchema = z.object({
  externalId: z.string().min(1), employeeNumber: z.string().min(1), requestType: z.enum(["benefit", "claim"]),
  category: z.string().min(1), amount: z.number().nonnegative(), approvedAt: z.string().datetime(), supportingDocuments: z.array(z.string().url()).default([]),
});

export const essSnapshotSchema = z.object({
  cursor: z.string().nullable(), employees: z.array(essEmployeeSchema), attendance: z.array(essAttendanceSchema), approvedRequests: z.array(essApprovedRequestSchema),
});

export type EssSnapshot = z.infer<typeof essSnapshotSchema>;
