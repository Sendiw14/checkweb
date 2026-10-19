import { describe, expect, it } from "vitest";
import { PUBLIC_STATUSES, normalizeVerifyResponse, shortRequestRef } from "@/lib/verification-types";

const FALLBACK = "11111111-2222-3333-4444-555555555555";

describe("normalizeVerifyResponse: the browser never trusts the shape of what came back", () => {
  it("passes a complete, valid response through", () => {
    const body = {
      status: "recognized_repeat", requestId: "abc-123", reference: "AXM-00000001",
      product: { name: "Brake pads", partNumber: "BP-1", brand: "Axiom", category: "Brakes", imageUrl: "/media/x.webp" },
      firstVerifiedAt: "2026-10-01T00:00:00Z", previousScanCount: 3,
    };
    expect(normalizeVerifyResponse(body, 200, FALLBACK)).toEqual({ ...body });
  });

  it("fills in a request reference when the body has none (this used to crash the page)", () => {
    const out = normalizeVerifyResponse({ status: "unavailable" }, 503, FALLBACK);
    expect(out).toEqual({ status: "unavailable", requestId: FALLBACK });
    expect(() => shortRequestRef(out.requestId)).not.toThrow();
  });

  it.each([
    ["null (unparseable body)", null, 502, "unavailable"],
    ["an HTML error page", "<html>Bad gateway</html>", 502, "unavailable"],
    ["an array", [], 200, "error"],
    ["a number", 42, 200, "error"],
    ["an object with no status", { ok: true }, 200, "error"],
    ["a non-string status", { status: 7 }, 200, "error"],
    ["an unknown status string from a proxy", { status: "bad gateway" }, 502, "unavailable"],
    ["a status that merely looks like a verdict", { status: "genuine" }, 200, "error"],
    ["prototype-pollution keys", JSON.parse('{"__proto__":{"status":"recognized_first"}}'), 200, "error"],
  ])("degrades %s to an honest state, never a verdict", (_n, body, http, expected) => {
    const out = normalizeVerifyResponse(body, http, FALLBACK);
    expect(out.status).toBe(expected);
    expect(out.requestId).toBe(FALLBACK);
  });

  it("an unknown status can never be mistaken for a recognized one", () => {
    for (const s of ["recognized", "RECOGNIZED_FIRST", "authentic", "", "valid"]) {
      expect(["error", "unavailable"]).toContain(normalizeVerifyResponse({ status: s }, 200, FALLBACK).status);
    }
  });

  it("drops malformed nested fields instead of rendering them", () => {
    const out = normalizeVerifyResponse({
      status: "recalled", requestId: "r", product: "not an object", recall: { reference: "RCL-1" }, previousScanCount: -4, retryAfterSeconds: "soon", reference: 5,
    }, 200, FALLBACK);
    expect(out).toEqual({ status: "recalled", requestId: "r" });
  });

  it("keeps recall text byte-for-byte (it is staff-approved wording, never rewritten)", () => {
    const instructions = "  Stop using this part.\nReturn it. <b>not markup</b>  ";
    const out = normalizeVerifyResponse({ status: "recalled", requestId: "r", recall: { reference: "RCL-2610-0001", title: "T", instructions, issuedAt: null } }, 200, FALLBACK);
    expect(out.recall?.instructions).toBe(instructions);
  });

  it("knows every status the server can send", () => {
    for (const s of PUBLIC_STATUSES) expect(normalizeVerifyResponse({ status: s, requestId: "r" }, 200, FALLBACK).status).toBe(s);
    expect(PUBLIC_STATUSES).toHaveLength(13);
  });

  it("clamps retryAfterSeconds and scan counts to sane integers", () => {
    const out = normalizeVerifyResponse({ status: "rate_limited", requestId: "r", retryAfterSeconds: 120.9, previousScanCount: 2.7 }, 429, FALLBACK);
    expect(out.retryAfterSeconds).toBe(120);
    expect(out.previousScanCount).toBe(2);
    expect(normalizeVerifyResponse({ status: "rate_limited", requestId: "r", retryAfterSeconds: Infinity }, 429, FALLBACK).retryAfterSeconds).toBeUndefined();
  });
});
