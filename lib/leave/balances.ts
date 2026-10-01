import { leaveBalancePolicies } from "@/lib/leave/types";

export type LeaveBalanceRequest = {
  leave_type: string;
  start_date: string;
  total_days: number | string;
  is_paid: boolean;
  status: string;
};

export type LeaveBalance = {
  key: string;
  label: string;
  entitlement: number;
  used: number;
  remaining: number;
};

export function calculateLeaveBalances(
  requests: LeaveBalanceRequest[],
  year = new Date().getFullYear(),
): LeaveBalance[] {
  return leaveBalancePolicies.map((policy) => {
    const used = requests.reduce((total, request) => {
      if (
        request.status !== "approved" ||
        !request.is_paid ||
        !policy.leaveTypes.some((leaveType) => leaveType === request.leave_type) ||
        Number(request.start_date.slice(0, 4)) !== year
      ) return total;
      return total + Number(request.total_days);
    }, 0);
    const roundedUsed = Math.round(used * 100) / 100;
    return {
      key: policy.key,
      label: policy.label,
      entitlement: policy.annualEntitlement,
      used: roundedUsed,
      remaining: Math.max(0, Math.round((policy.annualEntitlement - roundedUsed) * 100) / 100),
    };
  });
}
