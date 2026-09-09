export const payrollStatuses = ["draft", "processing", "pending_approval", "approved", "paid", "failed"] as const;

export type PayrollStatus = (typeof payrollStatuses)[number];

export type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  employees: number;
  grossPay: number;
  deductions: number;
  contributions: number;
  netPay: number;
  status: PayrollStatus;
  updatedAt: string;
};

export type PayrollMetric = {
  label: string;
  value: string;
  helper: string;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  tone?: "default" | "warning" | "success";
};

export type PayrollDashboardData = {
  runs: PayrollRun[];
  metrics: PayrollMetric[];
  lastUpdated: string;
  isDemo: boolean;
};

export type PayrollEmployee = {
  id: string;
  employeeId: string;
  name: string;
  initials: string;
  department: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  attendanceAdjustments: number;
  benefits: number;
  reimbursements: number;
  grossPay: number;
  deductions: number;
  netPay: number;
  status: "ready" | "needs_review";
};

export type PayrollReportItem = {
  id: string; employeeId: string; employeeNumber: string; employeeName: string; department: string;
  salaryFrequency: string; dailyRate: number; hourlyRate: number; workedDays: number; paidLeaveDays: number;
  lateMinutes: number; undertimeMinutes: number; absenceMinutes: number; overtimeMinutes: number;
  basicSalary: number; allowances: number; overtimePay: number; bonus: number; benefits: number; reimbursements: number; grossPay: number;
  lateDeduction: number; undertimeDeduction: number; absenceDeduction: number; sssEmployee: number; philhealthEmployee: number;
  withholdingTax: number; benefitDeduction: number; otherDeductions: number; totalDeductions: number;
  sssEmployer: number; philhealthEmployer: number; benefitEmployer: number; employerContributions: number; netPay: number; status: string;
};

export type PayrollRunReport = {
  run: { id: string; period_start: string; period_end: string; pay_date: string; preparation_date: string; schedule: string; status: PayrollStatus; employee_count: number; total_gross: number; total_deductions: number; total_contributions: number; total_net: number; calculated_at: string | null; rule_version: string | null };
  items: PayrollReportItem[];
};

export type WorkspaceSession = {
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  employmentStatus?: "active" | "on_leave" | "terminated";
  isSystemOwner?: boolean;
  active: boolean;
  roles: string[];
  mfaRequired?: boolean;
  authenticatorAssuranceLevel?: string;
};
