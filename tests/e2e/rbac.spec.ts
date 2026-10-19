import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ROLE_KEYS, statePath } from "./support/users";

type RoleKey = (typeof ROLE_KEYS)[number];

/**
 * An independent, human-reviewed oracle: what each role should see and reach. It is deliberately NOT derived
 * from src/server/auth/permissions.ts, so a mistake in that table (or in a page guard) fails here.
 */
const EVERYONE: RoleKey[] = ["owner", "admin", "production_operator", "warehouse_operator", "support_agent", "auditor"];
const PAGES: Record<string, { label: string | null; roles: RoleKey[] }> = {
  "/admin/dashboard": { label: "Dashboard", roles: EVERYONE },
  "/admin/products": { label: "Products", roles: EVERYONE },
  "/admin/batches": { label: "Batches", roles: EVERYONE },
  "/admin/part-units": { label: "Part units", roles: EVERYONE },
  "/admin/labels": { label: "QR labels", roles: ["owner", "admin", "production_operator", "warehouse_operator", "auditor"] },
  "/admin/scans": { label: "Scan activity", roles: ["owner", "admin", "support_agent", "auditor"] },
  "/admin/investigations": { label: "Investigations", roles: ["owner", "admin", "support_agent", "auditor"] },
  "/admin/recalls": { label: "Recalls", roles: ["owner", "admin", "warehouse_operator", "support_agent", "auditor"] },
  "/admin/support": { label: "Support cases", roles: ["owner", "admin", "support_agent", "auditor"] },
  "/admin/reports": { label: "Reports", roles: ["owner", "admin", "auditor"] },
  "/admin/team": { label: "Team", roles: ["owner", "admin", "auditor"] },
  "/admin/audit": { label: "Audit log", roles: ["owner", "admin", "auditor"] },
  "/admin/settings": { label: "Settings", roles: ["owner", "admin", "auditor"] },
  // Pages that change things need write permissions, which are narrower than read.
  "/admin/products/new": { label: null, roles: ["owner", "admin"] },
  "/admin/batches/new": { label: null, roles: ["owner", "admin", "production_operator"] },
  "/admin/labels/new": { label: null, roles: ["owner", "admin", "production_operator"] },
  "/admin/recalls/new": { label: null, roles: ["owner", "admin"] },
};
const DETAIL: Record<string, RoleKey[]> = {
  "/admin/products": PAGES["/admin/products"]!.roles,
  "/admin/batches": PAGES["/admin/batches"]!.roles,
  "/admin/part-units": PAGES["/admin/part-units"]!.roles,
  "/admin/label-jobs": PAGES["/admin/labels"]!.roles,
  "/admin/investigations": PAGES["/admin/investigations"]!.roles,
  "/admin/recalls": PAGES["/admin/recalls"]!.roles,
  "/admin/support": PAGES["/admin/support"]!.roles,
};
const DENIED = "You don't have access to that";

for (const role of ROLE_KEYS) {
  test.describe(`as ${role}`, () => {
    test.use({ storageState: statePath(role) });

    test("the navigation shows exactly the sections this role may open", async ({ page }) => {
      await page.goto("/admin/dashboard");
      const shown = (await page.getByRole("navigation", { name: "Admin" }).first().getByRole("link").allInnerTexts()).map((t) => t.trim()).sort();
      const expected = Object.values(PAGES).filter((p) => p.label && p.roles.includes(role)).map((p) => p.label!).sort();
      expect(shown).toEqual(expected);
    });

    for (const [path, { roles }] of Object.entries(PAGES)) {
      test(`${path} is ${roles.includes(role) ? "open" : "denied"}`, async ({ page }) => {
        await page.goto(path);
        if (roles.includes(role)) {
          await expect(page).toHaveURL(new RegExp(`${path}$`));
          await expect(page.getByText(DENIED)).toHaveCount(0);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        } else {
          await expect(page).toHaveURL(/\/admin\/access-denied/);
          await expect(page.getByText(DENIED)).toBeVisible();
          // Denied screens reveal nothing about the page behind them, and offer a way back.
          await expect(page.getByRole("link", { name: /back to the dashboard/i })).toBeVisible();
        }
      });
    }

    for (const [base, roles] of Object.entries(DETAIL)) {
      test(`${base}/<id>: ${roles.includes(role) ? "reaches the page (not found for a made-up id)" : "is denied before existence is revealed"}`, async ({ page }) => {
        await page.goto(`${base}/${randomUUID()}`);
        if (roles.includes(role)) {
          await expect(page.getByText("We couldn't find that")).toBeVisible();
        } else {
          // The same screen for every denied page, so nothing leaks about whether the id exists.
          await expect(page).toHaveURL(/\/admin\/access-denied/);
          await expect(page.getByText(DENIED)).toBeVisible();
          await expect(page.getByText("We couldn't find that")).toHaveCount(0);
        }
      });
    }

    test("write controls only appear for roles that can use them", async ({ page }) => {
      await page.goto("/admin/products");
      await expect(page.getByRole("link", { name: "New product" })).toHaveCount(["owner", "admin"].includes(role) ? 1 : 0);
      await page.goto("/admin/labels").catch(() => {});
      if (PAGES["/admin/labels"]!.roles.includes(role)) {
        await expect(page.getByRole("link", { name: /generate labels/i }).first()).toHaveCount(["owner", "admin", "production_operator"].includes(role) ? 1 : 0);
      }
      if (PAGES["/admin/team"]!.roles.includes(role)) {
        await page.goto("/admin/team");
        await expect(page.getByRole("button", { name: /invite someone/i })).toHaveCount(["owner", "admin"].includes(role) ? 1 : 0);
      }
    });

    test("CSV exports follow the same rules over the real session", async ({ request }) => {
      const allowed = ["owner", "admin", "auditor"].includes(role);
      for (const kind of ["events", "units", "audit"]) {
        const res = await request.get(`/api/admin/reports/export?kind=${kind}`);
        expect(res.status(), `${role} ${kind}`).toBe(allowed ? 200 : 403);
        if (allowed) {
          expect(res.headers()["content-type"]).toContain("text/csv");
          expect(res.headers()["cache-control"]).toContain("no-store");
        }
      }
    });

    test("the global search only returns things this role may read", async ({ request }) => {
      const res = await request.get("/api/admin/search?q=E2E");
      expect(res.status()).toBe(200);
      const hits = ((await res.json()) as { hits: { type: string }[] }).hits;
      const types = new Set(hits.map((h) => h.type));
      if (!["owner", "admin", "support_agent", "auditor"].includes(role)) {
        expect(types.has("support")).toBe(false);
        expect(types.has("investigation")).toBe(false);
      }
    });
  });
}

test.describe("anonymous", () => {
  test("every staff API refuses without a session", async ({ request }) => {
    for (const url of ["/api/admin/search?q=ab", "/api/admin/reports/export?kind=audit", `/api/admin/label-jobs/${randomUUID()}/download/1`]) {
      expect((await request.get(url)).status(), url).toBe(401);
    }
    expect((await request.get("/api/cron/maintenance")).status()).toBe(401);
  });

  test("every staff page bounces to sign-in", async ({ page }) => {
    for (const path of Object.keys(PAGES)) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login\?next=/);
    }
  });
});
