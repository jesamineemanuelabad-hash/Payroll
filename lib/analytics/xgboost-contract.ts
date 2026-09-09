import { z } from "zod";

export const attendanceFeatureSchema = z.object({
  attendanceRecordId: z.string().uuid(), employeeId: z.string().uuid(), scheduledStartMinute: z.number().int(), actualStartMinute: z.number().int().nullable(),
  workedMinutes: z.number().int().nonnegative(), overtimeMinutes: z.number().int().nonnegative(), rollingLateRate30d: z.number().min(0).max(1), rollingAbsenceRate30d: z.number().min(0).max(1),
  dayOfWeek: z.number().int().min(0).max(6), isHolidayAdjacent: z.boolean(),
});

export const attendancePredictionSchema = z.object({
  attendanceRecordId: z.string().uuid(), classification: z.enum(["on_time", "late", "absent", "overtime"]),
  classProbability: z.number().min(0).max(1), anomalyScore: z.number().min(0).max(1), anomalyReasons: z.array(z.string()), modelVersion: z.string().min(1),
});

export const xgboostBatchResponseSchema = z.object({
  modelVersion: z.string().min(1),
  scoredAt: z.string().datetime(),
  validationAccuracy: z.number().min(0).max(1).nullable().optional(),
  predictions: z.array(attendancePredictionSchema),
});
export type AttendanceFeature = z.infer<typeof attendanceFeatureSchema>;
export type AttendancePrediction = z.infer<typeof attendancePredictionSchema>;
export type XgboostBatchResult = z.infer<typeof xgboostBatchResponseSchema>;
