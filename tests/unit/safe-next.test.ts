import { describe, expect, it } from "vitest";
import { safeNext } from "@/server/auth/safe-next";

describe("safeNext", () => {
  it("allows staff paths", () => {
    expect(safeNext("/admin/products?page=2")).toBe("/admin/products?page=2");
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/admin?x=1")).toBe("/admin?x=1");
  });
  it.each([
    "https://evil.test", "//evil.test", "/\\evil.test", "/admin/\\x", "/login", "javascript:alert(1)", "/adminx", "/adminx/y",
    "/admin//evil.test", "/admin/../login", "", "/admin\n/x", "/admin\t", "/" + "a".repeat(400),
  ])("rejects %j", (bad) => expect(safeNext(bad)).toBe("/admin/dashboard"));
  it("rejects non-strings", () => {
    for (const bad of [undefined, null, 5, {}, ["/admin"]]) expect(safeNext(bad)).toBe("/admin/dashboard");
  });
});
