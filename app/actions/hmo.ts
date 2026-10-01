"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const hmoPackageSchema = z.object({
  id: z.string().uuid(),
  tier: z.enum(["Executive", "Premium", "Standard Plus", "Standard"]),
  providerId: z.string().uuid().nullable(),
  providerName: z.string().nullable(),
  annualPremium: z.number().nonnegative().nullable(),
  coverageDetails: z.string().nullable(),
  active: z.boolean(),
  salaryMin: z.number().nonnegative(),
  salaryMax: z.number().nonnegative().nullable(),
  pricingBasis: z.enum(["planning_estimate", "provider_quote"]),
});

const hmoProviderSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.enum(["active", "inactive"]),
  packageTiers: z.array(z.string()),
});

const hmoEmployeeSchema = z.object({
  id: z.string().uuid(),
  employeeNumber: z.string(),
  name: z.string(),
  departmentName: z.string().nullable(),
  currentMonthlySalary: z.number().nonnegative().nullable(),
  recommendedPackageId: z.string().uuid().nullable(),
  eligible: z.boolean(),
  eligibilityReason: z.string(),
  enrollmentId: z.string().uuid().nullable(),
  packageId: z.string().uuid().nullable(),
  status: z.enum(["pending", "active", "waived", "terminated"]).nullable(),
  membershipNumber: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  expirationDate: z.string().nullable(),
  notes: z.string().nullable(),
});

const snapshotSchema = z.object({
  policy: z.object({
    eligibilityRule: z.literal("active_payroll_employee"),
    effectiveFrom: z.string(),
    employerSharePercent: z.number().min(0).max(100),
  }),
  packages: z.array(hmoPackageSchema),
  providers: z.array(hmoProviderSchema),
  employees: z.array(hmoEmployeeSchema),
});

export type HmoSnapshot = z.infer<typeof snapshotSchema>;
export type HmoEmployee = HmoSnapshot["employees"][number];

function databaseMessage(error: { code?: string; message: string }) {
  if (error.code === "42501") return "Your account does not have permission for this HMO operation.";
  if (error.code === "PGRST202" || error.code === "42P01") return "Database setup is incomplete. Apply migration 202609300016_hmo_benefits_management.sql.";
  if (error.code === "23503" || error.code === "23514" || error.code === "23502" || error.code === "22P02") {
    return "Review the selected employee, package, status, and enrollment dates.";
  }
  return error.message;
}

export async function readHmoBenefits(): Promise<Result<HmoSnapshot>> {
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase and apply the HMO migration to view eligibility." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: databaseMessage(roleError) };
    if (!roles?.some((role) => ["super_admin", "hr_admin"].includes(role))) {
      return { ok: false, message: "Only HR administrators can view HMO eligibility and enrollment details." };
    }
    const { data, error } = await db.rpc("hmo_benefits_snapshot", {});
    if (error) return { ok: false, message: databaseMessage(error) };
    const parsed = snapshotSchema.safeParse(data);
    if (!parsed.success) return { ok: false, message: "HMO data could not be validated. Check the applied migration and stored records." };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, message: "Unable to load HMO details. Try again." };
  }
}

const enrollmentInputSchema = z.object({
  employeeId: z.string().uuid(),
  packageId: z.string().uuid(),
  status: z.enum(["pending", "active", "waived", "terminated"]),
  membershipNumber: z.string().max(100).nullable(),
  effectiveDate: z.string().date().nullable(),
  expirationDate: z.string().date().nullable(),
  notes: z.string().max(2000).nullable(),
}).strict();

export async function saveHmoEnrollment(input: unknown): Promise<Result<HmoEmployee>> {
  const parsed = enrollmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the enrollment details and try again." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before saving HMO enrollment details." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: databaseMessage(roleError) };
    if (!roles?.some((role) => ["super_admin", "hr_admin"].includes(role))) {
      return { ok: false, message: "Only HR administrators can update HMO enrollment details." };
    }
    const value = parsed.data;
    const { error } = await db.rpc("save_hmo_enrollment", {
      p_employee_id: value.employeeId,
      p_package_id: value.packageId,
      p_status: value.status,
      p_membership_number: value.membershipNumber,
      p_effective_date: value.effectiveDate,
      p_expiration_date: value.expirationDate,
      p_notes: value.notes,
    });
    if (error) return { ok: false, message: databaseMessage(error) };
    const { data: refreshed, error: refreshError } = await db.rpc("hmo_benefits_snapshot", {});
    if (refreshError) return { ok: false, message: `Enrollment was saved, but refreshed HMO details could not be loaded: ${databaseMessage(refreshError)}` };
    const snapshot = snapshotSchema.safeParse(refreshed);
    if (!snapshot.success) return { ok: false, message: "Enrollment was saved, but the refreshed HMO data could not be validated." };
    const employee = snapshot.data.employees.find((row) => row.id === value.employeeId);
    if (!employee) return { ok: false, message: "Enrollment was saved, but the employee is not present in the HMO roster." };
    revalidatePath("/payroll-benefits/benefits");
    return { ok: true, data: employee };
  } catch {
    return { ok: false, message: "Unable to save HMO enrollment. Refresh to check whether the update completed." };
  }
}

const packageProviderInputSchema = z.object({
  packageId: z.string().uuid(),
  providerId: z.string().uuid().nullable(),
}).strict();

export async function saveHmoPackageProvider(input: unknown): Promise<Result<HmoSnapshot>> {
  const parsed = packageProviderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Select a provider from the active directory." };
  if (!hasSupabaseEnvironment()) return { ok: false, message: "Connect Supabase before updating HMO package providers." };
  try {
    const db = await createSupabaseServerClient();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { ok: false, message: "Your session expired. Sign in again." };
    const { data: roles, error: roleError } = await db.rpc("record_roles", {});
    if (roleError) return { ok: false, message: databaseMessage(roleError) };
    if (!roles?.some((role) => ["super_admin", "hr_admin"].includes(role))) {
      return { ok: false, message: "Only HR administrators can update HMO package providers." };
    }
    const { error } = await db.rpc("save_hmo_package_provider", {
      p_package_id: parsed.data.packageId,
      p_provider_id: parsed.data.providerId,
    });
    if (error) return { ok: false, message: databaseMessage(error) };
    const { data: refreshed, error: refreshError } = await db.rpc("hmo_benefits_snapshot", {});
    if (refreshError) return { ok: false, message: `Provider was saved, but refreshed HMO details could not be loaded: ${databaseMessage(refreshError)}` };
    const snapshot = snapshotSchema.safeParse(refreshed);
    if (!snapshot.success) return { ok: false, message: "Provider was saved, but the refreshed HMO data could not be validated." };
    revalidatePath("/payroll-benefits/benefits");
    return { ok: true, data: snapshot.data };
  } catch {
    return { ok: false, message: "Unable to update the HMO package provider. Refresh to check whether the update completed." };
  }
}
