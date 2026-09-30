import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const applyChanges = process.argv.includes("--apply");
const targetPerStatus = 6;
const seedMarker = "[Workflow simulation]";
const moneyRound = (value: number) => Math.round(value * 100) / 100;

type Profile = {
  id: string;
  employee_number: string | null;
  first_name: string | null;
  last_name: string | null;
  employment_status: string;
  is_payroll_employee: boolean;
  is_system_owner: boolean;
};

type SalaryRecord = {
  employee_id: string;
  base_salary: number;
  effective_from: string;
  effective_to: string | null;
};

type RoleRow = { user_id: string; role: string };
type ProposalSeed = {
  employeeId: string;
  currentSalary: number;
  proposedSalary: number;
  status: "pending" | "rejected" | "approved";
  simulationSubmitter: string;
  simulationHrReviewer: string | null;
  simulationFinanceReviewer: string | null;
  rejectionReason: string | null;
  justification: string;
};

function fail(message: string): never {
  throw new Error(message);
}

async function seed() {
  if (!url || !serviceRoleKey) {
    fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the compensation proposal simulation.");
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const asOf = new Date().toISOString().slice(0, 10);
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const effectiveDate = new Date(Date.UTC(year, month, Number(monthEnd.slice(8, 10)) + 1)).toISOString().slice(0, 10);
  const cycleName = `Compensation Planning Workflow Simulation ${year}-${String(month).padStart(2, "0")}`;

  const [{ data: profiles, error: profilesError }, { data: salaryRows, error: salaryError }, { data: roleRows, error: rolesError }] = await Promise.all([
    db.from("profiles").select("id,employee_number,first_name,last_name,employment_status,is_payroll_employee,is_system_owner")
      .eq("employment_status", "active").eq("is_payroll_employee", true).eq("is_system_owner", false).order("employee_number"),
    db.from("employee_compensation_history").select("employee_id,base_salary,effective_from,effective_to")
      .lte("effective_from", asOf).order("effective_from", { ascending: false }),
    db.from("user_roles").select("user_id,role"),
  ]);
  if (profilesError) fail(`Unable to read eligible employees: ${profilesError.message}`);
  if (salaryError) fail(`Unable to read salary history: ${salaryError.message}`);
  if (rolesError) fail(`Unable to read reviewer roles: ${rolesError.message}`);

  const activeProfiles = (profiles ?? []) as Profile[];
  const currentSalaries = new Map<string, number>();
  for (const row of (salaryRows ?? []) as SalaryRecord[]) {
    if (!currentSalaries.has(row.employee_id) && (!row.effective_to || row.effective_to >= asOf)) {
      const salary = Number(row.base_salary);
      if (Number.isFinite(salary) && salary > 0) currentSalaries.set(row.employee_id, salary);
    }
  }

  const eligibleEmployees = activeProfiles
    .filter((profile) => currentSalaries.has(profile.id))
    .map((profile) => ({ profile, currentSalary: currentSalaries.get(profile.id)! }));

  const roleIds = [...new Set(((roleRows ?? []) as RoleRow[]).map((row) => row.user_id))];
  const { data: accountProfiles, error: accountProfilesError } = await db.from("profiles")
    .select("id,employment_status").in("id", roleIds);
  if (accountProfilesError) fail(`Unable to read the cycle creator account: ${accountProfilesError.message}`);
  const activeAccountIds = new Set((accountProfiles ?? [])
    .filter((profile: { employment_status: string }) => ["active", "on_leave"].includes(profile.employment_status))
    .map((profile: { id: string }) => profile.id));
  const cycleCreatorId = ((roleRows ?? []) as RoleRow[]).find((row) =>
    row.role === "super_admin" && activeAccountIds.has(row.user_id),
  )?.user_id;
  if (!cycleCreatorId) fail("An existing active Super Admin account is required to create the simulation cycle. No account was invented.");
  if (eligibleEmployees.length < targetPerStatus * 3) {
    fail(`Simulation needs 18 active employees with current salary records; found ${eligibleEmployees.length}. No proposal data was written.`);
  }

  const { data: migrationCheck, error: migrationError } = await db.from("compensation_reviews")
    .select("rejection_reason,simulation_submitter,simulation_hr_reviewer,simulation_finance_reviewer").limit(1);
  if (migrationError) {
    fail(`Apply migrations 202610010004_salary_proposal_rejection_reason.sql and 202610010005_compensation_simulation_actors.sql before seeding proposals: ${migrationError.message}`);
  }
  void migrationCheck;

  const { data: existingSimulationCycle, error: existingCycleError } = await db.from("compensation_cycles")
    .select("id,name,budget,status").eq("name", cycleName).maybeSingle();
  if (existingCycleError) fail(`Unable to check the simulation cycle: ${existingCycleError.message}`);
  const cycle = existingSimulationCycle;

  let existingSimulationRows: Record<string, unknown>[] = [];
  if (cycle?.id) {
    const { data, error } = await db.from("compensation_reviews")
      .select("employee_id,status,justification").eq("cycle_id", cycle.id);
    if (error) fail(`Unable to inspect existing simulation proposals: ${error.message}`);
    existingSimulationRows = (data ?? []).filter((row) => String(row.justification ?? "").startsWith(seedMarker));
  }

  const statusCounts = new Map(["pending", "rejected", "approved"].map((status) => [
    status,
    existingSimulationRows.filter((row) => row.status === status).length,
  ]));
  const missing = [...statusCounts.entries()].reduce((sum, [, count]) => sum + Math.max(0, targetPerStatus - count), 0);
  if (missing === 0) {
    console.log(`Simulation already has at least ${targetPerStatus} pending, ${targetPerStatus} rejected, and ${targetPerStatus} approved proposals; no changes made.`);
    return;
  }

  const usedEmployees = new Set(existingSimulationRows.map((row) => String(row.employee_id)));
  const { data: cycleProposals, error: cycleProposalsError } = cycle?.id
    ? await db.from("compensation_reviews").select("employee_id").eq("cycle_id", cycle.id)
    : { data: [], error: null };
  if (cycleProposalsError) fail(`Unable to check employees already assigned to the simulation cycle: ${cycleProposalsError.message}`);
  const occupiedEmployees = new Set((cycleProposals ?? []).map((row: { employee_id: string }) => row.employee_id));
  const available = eligibleEmployees.filter(({ profile }) => !occupiedEmployees.has(profile.id) && !usedEmployees.has(profile.id));
  if (available.length < missing) {
    fail(`Need ${missing} additional employees for the incomplete simulation; found ${available.length}. No new proposal data was written.`);
  }

  const seedRows: ProposalSeed[] = [];
  let employeeIndex = 0;
  for (const status of ["pending", "rejected", "approved"] as const) {
    const count = Math.max(0, targetPerStatus - (statusCounts.get(status) ?? 0));
    for (let item = 0; item < count; item += 1) {
      const employee = available[employeeIndex++];
      const submitterNumber = employeeIndex % 2 === 0 ? 1 : 2;
      const rate = [0.03, 0.04, 0.05, 0.06, 0.07, 0.08][item % 6];
      const currentSalary = employee.currentSalary;
      seedRows.push({
        employeeId: employee.profile.id,
        currentSalary,
        proposedSalary: moneyRound(currentSalary * (1 + rate)),
        status,
        simulationSubmitter: `[Simulation] HR Submitter ${submitterNumber}`,
        simulationHrReviewer: status === "pending" ? null : `[Simulation] HR Reviewer ${submitterNumber === 1 ? 2 : 1}`,
        simulationFinanceReviewer: status === "approved" ? "[Simulation] Finance Reviewer" : null,
        rejectionReason: status === "rejected" ? "Simulation decision: revise the compensation rationale before resubmission." : null,
        justification: `${seedMarker} ${Math.round(rate * 100)}% adjustment scenario for workflow review; this is a simulated decision and must not be implemented as contractual pay.`,
      });
    }
  }

  const budget = moneyRound(eligibleEmployees.slice(0, 18).reduce((sum, employee) => sum + employee.currentSalary, 0) * 0.1);
  if (!applyChanges) {
    console.log(`Dry run only. Would create or reuse one named simulation cycle and insert ${seedRows.length} proposals.`);
    console.log(`Required data available: ${eligibleEmployees.length} active employees with current salary and an existing active Super Admin to create the cycle.`);
    console.log(`Target counts: pending ${targetPerStatus}, rejected ${targetPerStatus}, approved ${targetPerStatus}. No database changes made. Re-run with --apply to persist.`);
    return;
  }

  let cycleId = cycle?.id as string | undefined;
  if (!cycleId) {
    const { data, error } = await db.from("compensation_cycles").insert({
      name: cycleName,
      starts_on: asOf,
      ends_on: monthEnd,
      budget,
      status: "active",
      created_by: cycleCreatorId,
    }).select("id").single();
    if (error) fail(`Unable to create the simulation review cycle: ${error.message}`);
    cycleId = data.id;
  } else {
    const { error } = await db.from("compensation_cycles").update({ budget }).eq("id", cycleId);
    if (error) fail(`Unable to update the simulation cycle budget: ${error.message}`);
  }

  const { data: inserted, error: insertError } = await db.from("compensation_reviews").insert(seedRows.map((row) => ({
    employee_id: row.employeeId,
    cycle_id: cycleId,
    current_salary: row.currentSalary,
    proposed_salary: row.proposedSalary,
    bonus: 0,
    effective_date: effectiveDate,
    justification: row.justification,
    status: row.status,
    rejection_reason: row.rejectionReason,
    simulation_submitter: row.simulationSubmitter,
    simulation_hr_reviewer: row.simulationHrReviewer,
    simulation_finance_reviewer: row.simulationFinanceReviewer,
  }))).select("id");
  if (insertError) fail(`Unable to insert simulation proposals: ${insertError.message}`);

  console.log(`Created ${inserted.length} compensation workflow simulation proposals for existing active employees.`);
  console.log(`The simulation includes pending, rejected, and approved states; approved proposals remain unimplemented and do not change salary history or payroll.`);
  console.log("Reviewers are labeled simulation personas, not accounts. No login users or roles were created; no salary details were printed.");
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Compensation proposal simulation failed.");
  process.exitCode = 1;
});
