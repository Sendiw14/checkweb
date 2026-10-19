import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { admin, appServer, closePools, verifier } from "./support/fixtures";

afterAll(closePools);

describe("statement timeouts are role settings, not client startup parameters", () => {
  it("each application role carries its own timeout", async () => {
    const { rows } = await admin.query("select rolname, rolconfig from pg_roles where rolname in ('app_server', 'app_verifier') order by rolname");
    const cfg = Object.fromEntries(rows.map((r) => [r.rolname, r.rolconfig as string[] | null]));
    expect(cfg.app_server).toContain("statement_timeout=15s");
    expect(cfg.app_verifier).toContain("statement_timeout=8s");
  });

  it("a plain connection as each role actually gets that timeout (so a pooler needs no special parameters)", async () => {
    expect((await appServer.query("show statement_timeout")).rows[0].statement_timeout).toBe("15s");
    expect((await verifier.query("show statement_timeout")).rows[0].statement_timeout).toBe("8s");
  });

  it("the verifier role really cancels a slow statement", async () => {
    await expect(verifier.query("select pg_sleep(9)")).rejects.toThrow(/statement timeout/i);
  }, 20_000);

  it("the application pool does not send statement_timeout as a startup parameter", () => {
    const src = readFileSync(join(process.cwd(), "src/server/db/pool.ts"), "utf8");
    expect(src).not.toMatch(/^\s*statement_timeout\s*:/m);
    expect(src).toMatch(/query_timeout/); // the client-side guard stays
  });
});
