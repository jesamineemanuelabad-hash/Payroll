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
