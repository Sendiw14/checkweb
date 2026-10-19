import { expect, test } from "@playwright/test";
import { PERSONAS, statePath } from "./support/users";

test.describe("harness", () => {
  test("anonymous visitors are sent to sign-in and land back where they were going", async ({ page }) => {
    await page.goto("/admin/batches");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fbatches/);
  });
  test.describe("signed in as owner (saved session)", () => {
    test.use({ storageState: statePath("owner") });
    test("the saved session opens the dashboard", async ({ page }) => {
      await page.goto("/admin/dashboard");
      await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
      expect(PERSONAS.owner.role).toBe("owner");
    });
  });
});
