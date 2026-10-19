import { expect, test } from "@playwright/test";
import { closeDb, createLiveUnit, db } from "./support/db";
import { statePath } from "./support/users";

test.afterAll(closeDb);

test.describe("support staff open and work an investigation from a part", () => {
  test.use({ storageState: statePath("support_agent") });
  test.describe.configure({ mode: "serial" });

  let unitId = "";
  let investigationUrl = "";

  test("a support agent opens an investigation from the part page", async ({ page }) => {
    const u = await createLiveUnit();
    unitId = u.unitId;
    await page.goto(`/admin/part-units/${unitId}`);
    await page.getByRole("button", { name: "Open investigation" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Open investigation" })).toBeDisabled(); // needs a reason
    await dialog.getByLabel(/what are you concerned about/i).fill("Customer says the label looks different from the one on their last order.");
    await dialog.getByRole("button", { name: "Open investigation" }).click();
    await expect(page).toHaveURL(/\/admin\/investigations\/[0-9a-f-]{36}/);
    investigationUrl = page.url();
    await expect(page.getByText(/looks different from the one on their last order/i)).toBeVisible();
    const row = (await db().query("select origin, severity, status, unit_id from public.investigations where id = $1", [investigationUrl.split("/").pop()])).rows[0];
    expect(row).toMatchObject({ origin: "manual", status: "open", unit_id: unitId });
    const audit = (await db().query("select actor_role from public.audit_logs where action = 'investigation.open' and target_id = $1", [investigationUrl.split("/").pop()])).rows;
    expect(audit.map((r) => r.actor_role)).toEqual(["support_agent"]);
  });

  test("asking again does not create a second case: it goes to the existing one", async ({ page }) => {
    await page.goto(`/admin/part-units/${unitId}`);
    await page.getByRole("button", { name: "Open investigation" }).click();
    await page.getByRole("dialog").getByLabel(/what are you concerned about/i).fill("Same concern raised again by another customer.");
    await page.getByRole("dialog").getByRole("button", { name: "Open investigation" }).click();
    await expect(page).toHaveURL(investigationUrl);
    expect((await db().query("select count(*)::int n from public.investigations where unit_id = $1", [unitId])).rows[0].n).toBe(1);
  });

  test("they can add a note and resolve it, and customers still see only their normal result", async ({ page }) => {
    await page.goto(investigationUrl);
    await page.getByLabel("Add a note").fill("Checked with the distributor: they relabelled stock in March.");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText(/relabelled stock in March/i)).toBeVisible();

    await page.getByRole("combobox", { name: "New status" }).click();
    await page.getByRole("option", { name: /resolved: benign/i }).click();
    await page.getByLabel(/what did you find/i).fill("Distributor relabelled; the code is genuine and unchanged.");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Status updated")).toBeVisible();
    expect((await db().query("select status from public.investigations where unit_id = $1", [unitId])).rows[0].status).toBe("resolved_benign");

  });
});

test.describe("who may open investigations", () => {
  test("production operators and warehouse staff have no such button; auditors can read but not open", async ({ browser }) => {
    const u = await createLiveUnit();
    for (const role of ["production_operator", "warehouse_operator", "auditor"] as const) {
      const ctx = await browser.newContext({ storageState: statePath(role), baseURL: test.info().project.use.baseURL });
      const page = await ctx.newPage();
      await page.goto(`/admin/part-units/${u.unitId}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(u.serial);
      await expect(page.getByRole("button", { name: "Open investigation" }), role).toHaveCount(0);
      await ctx.close();
    }
  });
});
