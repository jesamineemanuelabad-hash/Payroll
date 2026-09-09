import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: { baseURL: process.env.PAYROLL_TEST_URL ?? "http://localhost:3100", ...devices["Desktop Chrome"], channel: process.platform === "win32" ? "msedge" : undefined, trace: "retain-on-failure" },
  webServer: process.env.PAYROLL_TEST_URL ? undefined : {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { NEXT_DIST_DIR: ".next-playwright", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
  },
});
