import type { Route } from "next";

export const MFA_REQUIRED_ROLES = ["super_admin", "hr_admin", "payroll_manager", "hr_manager"] as const;

export function requiresMfa(roles: readonly string[]) {
  return roles.some((role) => (MFA_REQUIRED_ROLES as readonly string[]).includes(role));
}

export function mfaDestination(
  roles: readonly string[],
  assurance: { currentLevel: string | null; nextLevel: string | null },
  next: string = "/overview",
): Route | null {
  if (assurance.currentLevel === "aal1" && assurance.nextLevel === "aal2") {
    return `/mfa/challenge?next=${encodeURIComponent(safeMfaReturnPath(next))}`;
  }
  if (requiresMfa(roles) && assurance.currentLevel !== "aal2") return "/mfa/setup";
  return null;
}

export function safeMfaReturnPath(value: string | null | undefined): "/mfa/setup" | "/overview" {
  return value === "/mfa/setup" ? value : "/overview";
}

export function normalizeTotpQrCode(value: string) {
  const qrCode = value.trim();
  if (/^data:image\/svg\+xml;base64,/i.test(qrCode)) return qrCode;
  const dataPrefix = /^data:image\/svg\+xml(?:;charset=[^,;]+|;utf-8)?,/i;
  const svg = dataPrefix.test(qrCode) ? qrCode.slice(qrCode.indexOf(",") + 1) : qrCode;
  if (!svg.includes("<")) return dataPrefix.test(qrCode) ? qrCode : `data:image/svg+xml;charset=utf-8,${svg}`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
