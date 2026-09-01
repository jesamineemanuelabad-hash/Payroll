import type { AttendanceRecord, BenefitRecord, ClaimRecord, CompensationRecord } from "@/types/operations";

export const attendanceRecords: AttendanceRecord[] = [
  { id: "ATT-260830-001", employeeId: "EMP-1042", employee: "Mikaela Santos", initials: "MS", department: "Product & Design", date: "2026-08-30", timeIn: "08:47", timeOut: "18:12", workedHours: 9.42, lateMinutes: 0, overtimeHours: 1.42, classification: "overtime", syncStatus: "synced" },
  { id: "ATT-260830-002", employeeId: "EMP-0931", employee: "Paolo Reyes", initials: "PR", department: "Engineering", date: "2026-08-30", timeIn: "09:18", timeOut: "18:04", workedHours: 8.27, lateMinutes: 18, overtimeHours: 0, classification: "late", syncStatus: "synced" },
  { id: "ATT-260830-003", employeeId: "EMP-1118", employee: "Camille Mendoza", initials: "CM", department: "People Operations", date: "2026-08-30", timeIn: "08:55", timeOut: "17:58", workedHours: 8.05, lateMinutes: 0, overtimeHours: 0, classification: "on_time", syncStatus: "synced" },
  { id: "ATT-260830-004", employeeId: "EMP-0876", employee: "Luis Villanueva", initials: "LV", department: "Sales", date: "2026-08-30", timeIn: null, timeOut: null, workedHours: 0, lateMinutes: 0, overtimeHours: 0, classification: "absent", syncStatus: "pending" },
  { id: "ATT-260830-005", employeeId: "EMP-1204", employee: "Jana Lim", initials: "JL", department: "Finance", date: "2026-08-30", timeIn: "08:59", timeOut: "18:35", workedHours: 9.6, lateMinutes: 0, overtimeHours: 1.6, classification: "overtime", syncStatus: "synced" },
  { id: "ATT-260830-006", employeeId: "EMP-0998", employee: "Rafael Cruz", initials: "RC", department: "Customer Success", date: "2026-08-30", timeIn: "09:32", timeOut: "18:17", workedHours: 8.25, lateMinutes: 32, overtimeHours: 0, classification: "late", syncStatus: "conflict" },
  { id: "ATT-260829-007", employeeId: "EMP-1147", employee: "Nina Garcia", initials: "NG", department: "Engineering", date: "2026-08-29", timeIn: "08:51", timeOut: "17:56", workedHours: 8.08, lateMinutes: 0, overtimeHours: 0, classification: "on_time", syncStatus: "synced" },
  { id: "ATT-260829-008", employeeId: "EMP-1084", employee: "Anton Flores", initials: "AF", department: "Operations", date: "2026-08-29", timeIn: null, timeOut: null, workedHours: 0, lateMinutes: 0, overtimeHours: 0, classification: "on_leave", syncStatus: "synced" },
];

export const compensationRecords: CompensationRecord[] = [
  { id: "CMP-2026-041", employeeId: "EMP-1042", employee: "Mikaela Santos", initials: "MS", department: "Product & Design", currentSalary: 97500, proposedSalary: 106000, increase: 8.72, effectiveDate: "2026-09-01", reason: "Annual merit review", status: "approved" },
  { id: "CMP-2026-042", employeeId: "EMP-0931", employee: "Paolo Reyes", initials: "PR", department: "Engineering", currentSalary: 125000, proposedSalary: 139000, increase: 11.2, effectiveDate: "2026-09-01", reason: "Promotion to Staff Engineer", status: "submitted" },
  { id: "CMP-2026-043", employeeId: "EMP-1118", employee: "Camille Mendoza", initials: "CM", department: "People Operations", currentSalary: 89000, proposedSalary: 94300, increase: 5.96, effectiveDate: "2026-09-01", reason: "Market adjustment", status: "approved" },
  { id: "CMP-2026-044", employeeId: "EMP-0876", employee: "Luis Villanueva", initials: "LV", department: "Sales", currentSalary: 107500, proposedSalary: 112000, increase: 4.19, effectiveDate: "2026-10-01", reason: "Annual merit review", status: "draft" },
  { id: "CMP-2026-045", employeeId: "EMP-1204", employee: "Jana Lim", initials: "JL", department: "Finance", currentSalary: 103500, proposedSalary: 114000, increase: 10.14, effectiveDate: "2026-09-01", reason: "Expanded responsibilities", status: "applied" },
  { id: "CMP-2026-046", employeeId: "EMP-0998", employee: "Rafael Cruz", initials: "RC", department: "Customer Success", currentSalary: 86000, proposedSalary: 89000, increase: 3.49, effectiveDate: "2026-09-01", reason: "Annual merit review", status: "rejected" },
];

export const benefitRecords: BenefitRecord[] = [
  { id: "BEN-2608-019", employeeId: "EMP-1042", employee: "Mikaela Santos", initials: "MS", benefitType: "HMO", provider: "Maxicare", plan: "Platinum Plus", employeeCost: 850, employerCost: 3450, effectiveDate: "2026-09-01", eligibility: "eligible", payrollStatus: "applied" },
  { id: "BEN-2608-020", employeeId: "EMP-0931", employee: "Paolo Reyes", initials: "PR", benefitType: "Insurance", provider: "Sun Life Grepa", plan: "Group Life 24x", employeeCost: 0, employerCost: 1680, effectiveDate: "2026-09-01", eligibility: "eligible", payrollStatus: "applied" },
  { id: "BEN-2608-021", employeeId: "EMP-1118", employee: "Camille Mendoza", initials: "CM", benefitType: "Allowance", provider: "Northstar Co.", plan: "Communication Allowance", employeeCost: 0, employerCost: 2000, effectiveDate: "2026-09-01", eligibility: "eligible", payrollStatus: "pending" },
  { id: "BEN-2608-022", employeeId: "EMP-0876", employee: "Luis Villanueva", initials: "LV", benefitType: "Government", provider: "PhilHealth", plan: "Mandatory Coverage", employeeCost: 2500, employerCost: 2500, effectiveDate: "2026-08-01", eligibility: "eligible", payrollStatus: "applied" },
  { id: "BEN-2608-023", employeeId: "EMP-1204", employee: "Jana Lim", initials: "JL", benefitType: "Leave", provider: "Northstar Co.", plan: "Parental Leave", employeeCost: 0, employerCost: 0, effectiveDate: "2026-09-15", eligibility: "pending_documents", payrollStatus: "not_applicable" },
  { id: "BEN-2608-024", employeeId: "EMP-0998", employee: "Rafael Cruz", initials: "RC", benefitType: "HMO", provider: "Intellicare", plan: "Corporate Select", employeeCost: 0, employerCost: 2600, effectiveDate: "2026-09-01", eligibility: "eligible", payrollStatus: "pending" },
];

export const claimRecords: ClaimRecord[] = [
  { id: "CLM-2026-184", employee: "Mikaela Santos", initials: "MS", category: "Medical", description: "Prescription medicines", amount: 4850, submittedDate: "2026-08-28", documents: 2, verification: "verified", status: "ready_for_payroll" },
  { id: "CLM-2026-185", employee: "Paolo Reyes", initials: "PR", category: "Transportation", description: "Client site transportation", amount: 2180, submittedDate: "2026-08-28", documents: 3, verification: "verified", status: "approved_ess" },
  { id: "CLM-2026-186", employee: "Camille Mendoza", initials: "CM", category: "Office Expense", description: "Workshop materials", amount: 7340, submittedDate: "2026-08-27", documents: 1, verification: "needs_review", status: "verifying" },
  { id: "CLM-2026-187", employee: "Luis Villanueva", initials: "LV", category: "Travel", description: "Cebu client meeting", amount: 18560, submittedDate: "2026-08-26", documents: 4, verification: "verified", status: "included" },
  { id: "CLM-2026-188", employee: "Jana Lim", initials: "JL", category: "Meals", description: "Month-end working dinner", amount: 3280, submittedDate: "2026-08-26", documents: 0, verification: "missing_document", status: "verifying" },
  { id: "CLM-2026-189", employee: "Rafael Cruz", initials: "RC", category: "Communication", description: "Mobile data reimbursement", amount: 1500, submittedDate: "2026-08-25", documents: 1, verification: "verified", status: "included" },
];
