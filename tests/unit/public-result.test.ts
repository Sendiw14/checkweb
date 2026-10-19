import { describe, expect, it } from "vitest";
import { toPublicResult, type RawVerification } from "@/server/verification/public-result";
import { VERIFICATION_RESULTS } from "@/server/domain/enums";

const ctx = { requestId: "11111111-2222-3333-4444-555555555555", imageUrl: (p: string | null | undefined) => (p ? `https://img.test/${p}` : null) };

const full: RawVerification = {
  result: "recognized_first",
  eventId: 42,
  channel: "customer",
  riskReasons: ["rapid_repeat", "many_networks"],
  unit: { serial: "AXM-00000007", firstVerifiedAt: "2026-10-01T10:00:00Z", previousScanCount: 3, lifecycle: "released" },
  product: { name: "Ceramic Brake Pad Set", partNumber: "BP-2041", brand: "Axiom", category: "Brakes", imagePath: "products/x/pad.webp" },
  recall: { reference: "RCL-2610-0001", title: "Pad recall", instructions: "Stop driving. Call support.", issuedAt: "2026-10-02T00:00:00Z" },
};

describe("toPublicResult", () => {
  it("maps every database outcome (exhaustive)", () => {
    for (const result of VERIFICATION_RESULTS) {
      const out = toPublicResult({ ...full, result }, ctx);
      expect(out.body.requestId).toBe(ctx.requestId);
      expect(out.body.status).toBe(result);
      expect([200, 404]).toContain(out.httpStatus);
    }
  });

  it("never leaks internal fields, whatever the outcome", () => {
    for (const result of VERIFICATION_RESULTS) {
      const json = JSON.stringify(toPublicResult({ ...full, result }, ctx).body);
      for (const forbidden of ["rapid_repeat", "many_networks", "riskReasons", "eventId", "lifecycle", "released", "channel", "42"]) {
        expect(json, `${result} leaked ${forbidden}`).not.toContain(`"${forbidden}"`);
      }
      expect(json).not.toContain("rapid_repeat");
    }
  });

  it("invalid is a 404 with no detail", () => {
    expect(toPublicResult({ result: "invalid", eventId: 1 }, ctx)).toEqual({ httpStatus: 404, body: { requestId: ctx.requestId, status: "invalid" } });
  });

  it("first verification shows product and serial but no prior-scan data", () => {
    const { body } = toPublicResult({ ...full, result: "recognized_first" }, ctx);
    expect(body.reference).toBe("AXM-00000007");
    expect(body.product).toMatchObject({ name: "Ceramic Brake Pad Set", partNumber: "BP-2041", imageUrl: "https://img.test/products/x/pad.webp" });
    expect(body).not.toHaveProperty("firstVerifiedAt");
    expect(body).not.toHaveProperty("recall");
  });

  it("repeat and suspicious scans share the same customer-facing fields (no accusation, no reasons)", () => {
    const a = toPublicResult({ ...full, result: "recognized_repeat" }, ctx).body;
    const b = toPublicResult({ ...full, result: "suspicious" }, ctx).body;
    expect({ ...a, status: "x" }).toEqual({ ...b, status: "x" });
    expect(a.previousScanCount).toBe(3);
    expect(a.firstVerifiedAt).toBe("2026-10-01T10:00:00Z");
  });

  it("recalled returns the approved recall text verbatim and nothing else invented", () => {
    const { body } = toPublicResult({ ...full, result: "recalled" }, ctx);
    expect(body.recall).toEqual({ reference: "RCL-2610-0001", title: "Pad recall", instructions: "Stop driving. Call support.", issuedAt: "2026-10-02T00:00:00Z" });
  });

  it("revoked exposes nothing about the product", () => {
    expect(toPublicResult({ ...full, result: "revoked" }, ctx).body).toEqual({ requestId: ctx.requestId, status: "revoked" });
  });

  it("quarantined / not released / retired show the product but no scan history", () => {
    for (const result of ["quarantined", "not_released", "retired"] as const) {
      const { body } = toPublicResult({ ...full, result }, ctx);
      expect(body.product?.name).toBe("Ceramic Brake Pad Set");
      expect(body).not.toHaveProperty("firstVerifiedAt");
      expect(body).not.toHaveProperty("previousScanCount");
    }
  });
});
