import { expect, test } from "@playwright/test";

test("record pages show honest setup state and disable mutations without a database", async ({ page }) => {
  for (const route of ["people", "attendance", "compensation", "benefits", "claims", "payroll"]) {
    await page.goto(`/payroll-benefits/${route}`);
    await expect(page.getByText("Database not connected.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Create / })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Excel", exact: true })).toBeDisabled();
    await expect(page.getByText("No records yet.")).toBeVisible();
  }
});

test("all record tabs are available and fit mobile screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/payroll-benefits/benefits");
  await page.getByRole("button", { name: "Benefit plans", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Benefit plans", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Providers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByText("Priority Handling Logistics, Inc.").last()).toBeVisible();
});

test("login reports missing configuration without a fake success", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Work email", { exact: true }).fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in to workspace", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Configure Supabase before signing in.");
  await expect(page).toHaveURL(/\/login$/);
});

test("overview and analytics require live reporting instead of rendering sample metrics", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Live overview unavailable" })).toBeVisible();
  await expect(page.getByText("Overview preview:", { exact: false })).toHaveCount(0);
  await page.goto("/payroll-benefits/analytics");
  await expect(page.getByRole("heading", { name: "Live analytics unavailable" })).toBeVisible();
  await expect(page.getByText("Analytics preview:", { exact: false })).toHaveCount(0);
});

test("administrator account settings has a dedicated responsive route", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/profile");
  await expect(page.getByRole("heading", { name: "Account settings unavailable" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto("/settings/access");
  await expect(page.getByRole("heading", { name: "Access control unavailable" })).toBeVisible();
});
