import assert from "node:assert/strict";
import test from "node:test";
import { attendanceMinutes, rowsFromMatrix } from "../lib/imports/spreadsheet";

test("HR2 spreadsheet headers are normalized without importing access roles", () => {
  const rows = rowsFromMatrix([
    ["Employee ID", "First Name", "Last Name", "Email", "Department", "Position", "Role", "Hire Date", "Base Salary"],
    ["EMP-001", "Juan", "Dela Cruz", "juan@example.com", "Operations", "Dispatcher", "Admin", new Date(2026, 8, 1), 30000],
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee_number, "EMP-001");
  assert.equal(rows[0].job_title, "Dispatcher");
  assert.equal(rows[0].role, "Admin");
  assert.equal(rows[0].hired_at, "2026-09-01");
});

test("attendance import calculates late, undertime, overtime, and worked minutes", () => {
  const late = attendanceMinutes({ attendanceDate: "2026-09-23", timeIn: "09:15", timeOut: "17:45", scheduledTimeIn: "09:00", scheduledTimeOut: "18:00" });
  assert.deepEqual(late, { workedMinutes: 450, lateMinutes: 15, undertimeMinutes: 15, overtimeMinutes: 0, absenceMinutes: 0, classification: "late" });
  const overtime = attendanceMinutes({ attendanceDate: "2026-09-23", timeIn: "09:00", timeOut: "19:30" });
  assert.equal(overtime.overtimeMinutes, 90);
  assert.equal(overtime.classification, "overtime");
  const absent = attendanceMinutes({ attendanceDate: "2026-09-23" });
  assert.equal(absent.absenceMinutes, 480);
  assert.equal(absent.classification, "absent");
});

test("salary proposal spreadsheet headers map to the compensation workflow", () => {
  const rows = rowsFromMatrix([
    ["Employee ID", "Review Cycle", "Current Salary", "Proposed Salary", "Bonus", "Effective Date", "Adjustment Reason"],
    ["EMP-001", "2027 Annual Review", 30000, 33000, 2500, new Date(2027, 0, 1), "Merit increase"],
  ]);
  assert.deepEqual(rows[0], {
    employee_number: "EMP-001", review_cycle: "2027 Annual Review", current_salary: 30000,
    proposed_salary: 33000, bonus: 2500, effective_date: "2027-01-01", justification: "Merit increase",
  });
});
