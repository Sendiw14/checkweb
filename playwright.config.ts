import { defineConfig, devices } from "@playwright/test";
import { E2E } from "./tests/e2e/support/env";

/**
 * Needs the local stack: Postgres + Supabase Auth (npm run dev:stack) and the app (npm run dev, started
 * automatically below unless E2E_BASE_URL points at one that's already running). Tests run serially
 * because they share one database and exercise real rate limits.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: E2E.baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /(rbac|workflow|mfa)\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: `${E2E.baseURL}/api/health`, reuseExistingServer: true, timeout: 180_000 },
});
