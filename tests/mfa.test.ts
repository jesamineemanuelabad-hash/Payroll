import assert from "node:assert/strict";
import test from "node:test";
import { mfaDestination, normalizeTotpQrCode, requiresMfa, safeMfaReturnPath } from "../lib/auth/mfa";

test("privileged roles require MFA and enrolled accounts receive a challenge", () => {
  assert.equal(requiresMfa(["super_admin"]), true);
  assert.equal(requiresMfa(["employee"]), false);
  assert.equal(mfaDestination(["super_admin"], { currentLevel: "aal1", nextLevel: "aal1" }), "/mfa/setup");
  assert.equal(mfaDestination(["employee"], { currentLevel: "aal1", nextLevel: "aal2" }), "/mfa/challenge?next=%2Foverview");
  assert.equal(mfaDestination(["payroll_manager"], { currentLevel: "aal2", nextLevel: "aal2" }), null);
});

test("MFA return paths reject external and untrusted destinations", () => {
  assert.equal(safeMfaReturnPath("/mfa/setup"), "/mfa/setup");
  assert.equal(safeMfaReturnPath("https://example.com"), "/overview");
  assert.equal(safeMfaReturnPath("//example.com"), "/overview");
});

test("raw Supabase SVG QR data is encoded for the Next image component", () => {
  const raw = 'data:image/svg+xml;utf-8,<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" /></svg>';
  const normalized = normalizeTotpQrCode(raw);
  assert.match(normalized, /^data:image\/svg\+xml;charset=utf-8,%3C%3Fxml/);
  assert.equal(normalized.includes("<"), false);
  assert.equal(normalizeTotpQrCode("data:image/svg+xml;base64,PHN2Zy8+"), "data:image/svg+xml;base64,PHN2Zy8+");
});
