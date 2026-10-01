export const leaveTypeCatalog = [
  { value: "vawc", label: "VAWC leave", description: "Leave category for violence against women and children." },
  { value: "emergency", label: "Emergency leave", description: "Urgent personal or family matters." },
  { value: "bereavement", label: "Bereavement leave", description: "Time away following a family bereavement." },
  { value: "paternity", label: "Paternity leave", description: "Leave related to paternity." },
  { value: "annual", label: "Annual leave", description: "Annual leave under the company leave policy." },
  { value: "unpaid", label: "Unpaid leave", description: "Approved time away without paid-leave treatment." },
  { value: "maternity", label: "Maternity leave", description: "Leave related to maternity." },
  { value: "magna_carta_women", label: "Magna Carta for Women leave", description: "Leave category recorded under the company policy." },
  { value: "calamity", label: "Emergency / calamity leave", description: "Leave related to an emergency or calamity." },
  { value: "solo_parent", label: "Solo parent leave", description: "Leave related to solo-parent responsibilities." },
  { value: "vacation", label: "Vacation leave", description: "Planned time away from work." },
  { value: "sick", label: "Sick leave", description: "Time away due to illness or recovery." },
  { value: "service_incentive", label: "Service incentive leave", description: "Service incentive leave category." },
  { value: "other", label: "Other leave", description: "Other leave category recorded in the system." },
] as const;

export type LeaveTypeCode = (typeof leaveTypeCatalog)[number]["value"];

export const leaveBalancePolicies = [
  {
    key: "vacation",
    label: "Vacation / annual leave",
    annualEntitlement: 10,
    leaveTypes: ["vacation", "annual", "service_incentive"],
    description: "10 days per calendar year. Vacation, annual, and service incentive requests share this paid leave bank.",
  },
  {
    key: "sick",
    label: "Sick leave",
    annualEntitlement: 10,
    leaveTypes: ["sick"],
    description: "10 days per calendar year.",
  },
] as const;
