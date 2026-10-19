import { expect, test } from "@playwright/test";
import { statePath } from "./support/users";

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

test.describe("security headers and CSP (proxy)", () => {
  test("public pages carry a nonce-based CSP and the hardening headers", async ({ request }) => {
    const res = await request.get("/faq");
    const h = res.headers();
    const csp = h["content-security-policy"]!;
    expect(csp, "CSP present: proxy is actually running").toBeTruthy();
    for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]) expect(csp).toContain(d);
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBeTruthy();
    expect(h["permissions-policy"]).toContain("camera=()");
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  });

  test("every script tag carries this response's nonce, and the nonce changes per request", async ({ request }) => {
    const a = await request.get("/faq");
    const b = await request.get("/faq");
    const nonceA = nonceOf(a.headers()["content-security-policy"]!)!;
    const nonceB = nonceOf(b.headers()["content-security-policy"]!)!;
    expect(nonceA).not.toBe(nonceB);
    const html = await a.text();
    // JSON-LD style data blocks are not executable, so CSP does not apply to them.
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!).filter((attrs) => !/type="application\/(ld\+)?json"/.test(attrs));
    expect(scripts.length).toBeGreaterThan(0);
    const bare = scripts.filter((attrs) => !attrs.includes(`nonce="${nonceA}"`));
    // Anything without the nonce could only run if CSP allowed it; there must be none.
    expect(bare, bare.join("\n")).toEqual([]);
  });

  test("the verify page is never cached and never sends a referrer", async ({ request }) => {
    const h = (await request.get("/verify")).headers();
    expect(h["cache-control"]).toContain("no-store");
    expect(h["referrer-policy"]).toBe("no-referrer");
  });

  test("the browser really enforces the policy: foreign images, frames and fetches are blocked and reported", async ({ page }) => {
    await page.goto("/faq");
    const blocked = await page.evaluate(() => new Promise<string[]>((resolve) => {
      const seen: string[] = [];
      document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.violatedDirective}`));
      const img = new Image(); img.src = "https://evil.example/x.png"; document.body.appendChild(img);
      const f = document.createElement("iframe"); f.src = "https://evil.example/"; document.body.appendChild(f);
      fetch("https://evil.example/x").catch(() => {});
      setTimeout(() => resolve(seen), 700);
    }));
    expect(blocked.sort()).toEqual(["connect-src", "frame-src", "img-src"]);
  });

  test("anonymous visitors to the staff area are redirected to sign-in and keep their destination", async ({ page }) => {
    await page.goto("/admin/batches?status=pending");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fbatches%3Fstatus%3Dpending/);
  });

  test("staff pages are not cacheable", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: statePath("owner") });
    const res = await ctx.request.get("/admin/dashboard");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["referrer-policy"]).toBe("same-origin");
    await ctx.close();
  });
});
