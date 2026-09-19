import { expect, test } from "@playwright/test";

test("signed-out landing page hides the dashboard shortcut", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open dashboard", exact: true })).toHaveCount(0);
});

test("logout confirmation redirect shows a success message", async ({ page }) => {
  await page.goto("/login?signedOut=1");
  await expect(page.getByText("Signed out securely", { exact: true })).toBeVisible();
  await expect(page.getByText(/secure workspace session has ended/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("login module previews respond to selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with your people." })).toBeVisible();
  await expect(page.getByRole("button", { name: "People", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Benefits", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Take care of the details." })).toBeVisible();
  await page.screenshot({ path: "test-results/login-desktop.png", fullPage: true, animations: "disabled" });
});

test("password visibility and sign-in help work without submitting credentials", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("preview-only-password");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("preview-only-password");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByText("Need help signing in?", { exact: true }).click();
  await expect(page.getByText(/Ask them to confirm your account/)).toBeVisible();
  await page.getByLabel("Work email", { exact: true }).fill("invalid-email");
  expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
});

test("mobile login stays in bounds and honors reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in to workspace", exact: true })).toBeVisible();
  await expect(page.getByLabel("Explore the workspace")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const duration = await page.locator(".login-enter").first().evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThan(0.001);
  await page.screenshot({ path: "test-results/login-mobile.png", fullPage: true, animations: "disabled" });
});

test("normal login hides bootstrap while the protected setup route remains available", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Create first administrator", exact: true })).toHaveCount(0);
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Create the first administrator." })).toBeVisible();
  await expect(page.getByLabel("Private setup token", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show setup credentials" }).click();
  await expect(page.getByLabel("Private setup token", { exact: true })).toHaveAttribute("type", "text");
});
