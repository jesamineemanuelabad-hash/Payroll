import type { Route } from "next";

export const MFA_REQUIRED_ROLES = ["super_admin", "hr_admin", "payroll_manager", "hr_manager"] as const;

export function requiresMfa(roles: readonly string[]) {
  return roles.some((role) => (MFA_REQUIRED_ROLES as readonly string[]).includes(role));
}

export function mfaDestination(
  roles: readonly string[],
  emailMfaVerified: boolean,
  assurance: { currentLevel: string | null; nextLevel: string | null },
  next: string = "/overview",
): Route | null {
  if (!emailMfaVerified && (requiresMfa(roles) || (assurance.currentLevel === "aal1" && assurance.nextLevel === "aal2"))) {
    return `/mfa/challenge?next=${encodeURIComponent(safeMfaReturnPath(next))}`;
  }
  return null;
}

export function safeMfaReturnPath(value: string | null | undefined): "/mfa/setup" | "/overview" {
  return value === "/mfa/setup" ? value : "/overview";
}
