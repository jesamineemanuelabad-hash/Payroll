import type { PayrollEmployee } from "@/types/payroll";

export const samplePayrollEmployees: PayrollEmployee[] = [
  { id: "1", employeeId: "EMP-1042", name: "Mikaela Santos", initials: "MS", department: "Product & Design", basicSalary: 48750, allowances: 5500, overtime: 2860, attendanceAdjustments: 0, benefits: 850, reimbursements: 4850, grossPay: 61960, deductions: 10106, netPay: 51854, status: "ready" },
  { id: "2", employeeId: "EMP-0931", name: "Paolo Reyes", initials: "PR", department: "Engineering", basicSalary: 62500, allowances: 7000, overtime: 4190, attendanceAdjustments: -420, benefits: 0, reimbursements: 2180, grossPay: 75450, deductions: 12640, netPay: 62810, status: "ready" },
  { id: "3", employeeId: "EMP-1118", name: "Camille Mendoza", initials: "CM", department: "People Operations", basicSalary: 44500, allowances: 5000, overtime: 0, attendanceAdjustments: 0, benefits: 2000, reimbursements: 0, grossPay: 51500, deductions: 8140, netPay: 43360, status: "ready" },
  { id: "4", employeeId: "EMP-0876", name: "Luis Villanueva", initials: "LV", department: "Sales", basicSalary: 53750, allowances: 6500, overtime: 1680, attendanceAdjustments: -2440, benefits: 0, reimbursements: 18560, grossPay: 78050, deductions: 10472, netPay: 67578, status: "needs_review" },
  { id: "5", employeeId: "EMP-1204", name: "Jana Lim", initials: "JL", department: "Finance", basicSalary: 51750, allowances: 5500, overtime: 930, attendanceAdjustments: 0, benefits: 0, reimbursements: 0, grossPay: 58180, deductions: 9560, netPay: 48620, status: "ready" },
  { id: "6", employeeId: "EMP-0998", name: "Rafael Cruz", initials: "RC", department: "Customer Success", basicSalary: 43000, allowances: 5000, overtime: 2240, attendanceAdjustments: -730, benefits: 2600, reimbursements: 1500, grossPay: 53610, deductions: 8074, netPay: 45536, status: "ready" },
];
