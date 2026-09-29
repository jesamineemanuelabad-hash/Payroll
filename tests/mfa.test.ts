import assert from "node:assert/strict";
import test from "node:test";
import { mfaDestination, requiresMfa, safeMfaReturnPath } from "../lib/auth/mfa";

test("privileged roles require MFA and enrolled accounts receive a challenge", () => {
  assert.equal(requiresMfa(["super_admin"]), true);
  assert.equal(requiresMfa(["employee"]), false);
  assert.equal(mfaDestination(["super_admin"], false, { currentLevel: "aal1", nextLevel: "aal1" }), "/mfa/challenge?next=%2Foverview");
  assert.equal(mfaDestination(["employee"], false, { currentLevel: "aal1", nextLevel: "aal2" }), "/mfa/challenge?next=%2Foverview");
  assert.equal(mfaDestination(["payroll_manager"], true, { currentLevel: "aal1", nextLevel: "aal1" }), null);
  assert.equal(mfaDestination(["payroll_manager"], false, { currentLevel: "aal2", nextLevel: "aal2" }), "/mfa/challenge?next=%2Foverview");
});

test("MFA return paths reject external and untrusted destinations", () => {
  assert.equal(safeMfaReturnPath("/mfa/setup"), "/mfa/setup");
  assert.equal(safeMfaReturnPath("https://example.com"), "/overview");
  assert.equal(safeMfaReturnPath("//example.com"), "/overview");
});
