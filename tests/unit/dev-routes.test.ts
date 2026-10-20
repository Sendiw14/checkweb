import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src/app/dev");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? pages(p) : name === "page.tsx" || name === "route.ts" ? [p] : [];
  });
}

/** Development-only routes (component galleries, mock states) must never be reachable in production. */
describe("development-only routes", () => {
  const files = pages(root);

  it("exist only under src/app/dev", () => expect(files.length).toBeGreaterThan(0));

  it.each(files)("%s answers 404 in production", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/process\.env\.NODE_ENV === "production"\)\s*notFound\(\)/);
  });
});
