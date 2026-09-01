export type ExportValue = string | number | boolean | Date;
export type ExportRecord = Record<string, ExportValue>;

export type AttendanceClassification = "on_time" | "late" | "absent" | "overtime" | "on_leave";
export type SyncStatus = "synced" | "pending" | "conflict" | "failed";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employee: string;
  initials: string;
  department: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  workedHours: number;
  lateMinutes: number;
  overtimeHours: number;
  classification: AttendanceClassification;
  syncStatus: SyncStatus;
};

export type CompensationRecord = {
  id: string;
  employeeId: string;
  employee: string;
  initials: string;
  department: string;
  currentSalary: number;
  proposedSalary: number;
  increase: number;
  effectiveDate: string;
  reason: string;
  status: "draft" | "submitted" | "approved" | "applied" | "rejected";
};

export type BenefitRecord = {
  id: string;
  employeeId: string;
  employee: string;
  initials: string;
  benefitType: "HMO" | "Allowance" | "Insurance" | "Leave" | "Government";
  provider: string;
  plan: string;
  employeeCost: number;
  employerCost: number;
  effectiveDate: string;
  eligibility: "eligible" | "pending_documents" | "not_eligible";
  payrollStatus: "applied" | "pending" | "not_applicable";
};

export type ClaimRecord = {
  id: string;
  employee: string;
  initials: string;
  category: string;
  description: string;
  amount: number;
  submittedDate: string;
  documents: number;
  verification: "verified" | "needs_review" | "missing_document";
  status: "approved_ess" | "verifying" | "ready_for_payroll" | "included" | "rejected";
};
