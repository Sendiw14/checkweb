import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

/**
 * With a src/ directory Next.js only loads src/proxy.ts. A proxy.ts at the repository root is ignored
 * without any warning, which silently disables the CSP, the security headers, the session refresh and the
 * anonymous redirect (pages keep rendering, so nothing looks broken). This test makes that mistake loud.
 */
describe("request proxy placement", () => {
  it("lives in src/ because the app lives in src/", () => {
    expect(existsSync(join(root, "src/app"))).toBe(true);
    expect(existsSync(join(root, "src/proxy.ts"))).toBe(true);
  });

  it("is not also (or only) at the repository root, where Next.js would ignore it", () => {
    for (const f of ["proxy.ts", "proxy.js", "middleware.ts", "middleware.js"]) expect(existsSync(join(root, f)), f).toBe(false);
  });

  it("exports the proxy function and a matcher that excludes assets and API routes", () => {
    const src = readFileSync(join(root, "src/proxy.ts"), "utf8");
    expect(src).toMatch(/export async function proxy\(/);
    expect(src).toMatch(/export const config\b/);
    expect(src).toMatch(/\(\?!api\|_next\/static\|_next\/image/);
  });

  it("sets the headers the security model relies on", () => {
    const src = readFileSync(join(root, "src/proxy.ts"), "utf8");
    for (const h of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]) {
      expect(src, h).toContain(h);
    }
    expect(src).toContain("frame-ancestors 'none'");
    expect(src).toContain("object-src 'none'");
    expect(src).toContain("base-uri 'self'");
    expect(src).toContain("form-action 'self'");
    // 'unsafe-eval' is a development-only allowance and must stay conditional on isProd.
    expect(src).toMatch(/isProd \? "" : " 'unsafe-eval'"/);
    expect(src).not.toMatch(/script-src[^\n]*'unsafe-inline'/);
  });
});
