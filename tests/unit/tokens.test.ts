import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildVerificationUrl,
  formatManualCode,
  generateManualCode,
  generateToken,
  hashManualCode,
  hashNetwork,
  hashParsedCredential,
  hashToken,
  isWellFormedToken,
  normalizeManualCode,
  parseCredential,
} from "@/server/security/tokens";

describe("token generation", () => {
  it("produces 43-char base64url tokens decoding to exactly 32 bytes", () => {
    const t = generateToken();
    expect(t).toHaveLength(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(t, "base64url")).toHaveLength(32);
    expect(isWellFormedToken(t)).toBe(true);
  });

  it("never repeats across many draws (collision smoke test)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) seen.add(generateToken());
    expect(seen.size).toBe(20_000);
  });

  it("has roughly uniform bits (no obvious structure)", () => {
    // Count set bits over 2,000 tokens: expect ~50% with a very wide tolerance.
    let ones = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) for (const b of Buffer.from(generateToken(), "base64url")) ones += b.toString(2).replace(/0/g, "").length;
    const ratio = ones / (n * 32 * 8);
    expect(ratio).toBeGreaterThan(0.49);
    expect(ratio).toBeLessThan(0.51);
  });

  it("rejects malformed tokens", () => {
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken("a".repeat(43))).toBe(true); // 43 b64url chars decode to 32 bytes
    expect(isWellFormedToken("a".repeat(44))).toBe(false);
    expect(isWellFormedToken("!".repeat(43))).toBe(false);
  });
});

describe("hashing", () => {
  it("hashToken is SHA-256 of the complete token string", () => {
    const t = generateToken();
    expect(hashToken(t).toString("hex")).toBe(createHash("sha256").update(t).digest("hex"));
    expect(hashToken(t)).toHaveLength(32);
  });

  it("domain-separates manual codes from tokens", () => {
    const code = generateManualCode();
    expect(hashManualCode(code).equals(hashToken(code))).toBe(false);
  });
});

describe("manual codes", () => {
  it("generates 20 Crockford characters", () => {
    for (let i = 0; i < 200; i++) expect(generateManualCode()).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{20}$/);
  });

  it("formats in groups of four", () => {
    expect(formatManualCode("ABCDEFGHJKMNPQRSTVWX")).toBe("ABCD-EFGH-JKMN-PQRS-TVWX");
  });

  it("normalises common typing mistakes", () => {
    expect(normalizeManualCode("abcd-efgh-jkmn-pqrs-tvwx")).toBe("ABCDEFGHJKMNPQRSTVWX");
    expect(normalizeManualCode("ABCD EFGH JKMN PQRS TVWX")).toBe("ABCDEFGHJKMNPQRSTVWX");
    expect(normalizeManualCode("O0O0-I1L1-ABCD-EFGH-JKMN")).toBe("00001111ABCDEFGHJKMN");
    expect(normalizeManualCode("ABCD-EFGH")).toBeNull();
    expect(normalizeManualCode("UUUU-UUUU-UUUU-UUUU-UUUU")).toBeNull();
  });
});

describe("parseCredential", () => {
  it("classifies tokens, codes and pasted URLs; rejects everything else", () => {
    const t = generateToken();
    expect(parseCredential(t)).toEqual({ kind: "token", value: t });
    expect(parseCredential(`  ${t}\n`)).toEqual({ kind: "token", value: t });
    expect(parseCredential(`https://verify.example.com/verify#${t}`)).toEqual({ kind: "token", value: t });
    expect(parseCredential("abcd-efgh-jkmn-pqrs-tvwx")).toEqual({ kind: "code", value: "ABCDEFGHJKMNPQRSTVWX" });
    for (const bad of ["", "   ", "hello", "x".repeat(600), 42, null, undefined, {}, [t]]) {
      expect(parseCredential(bad as unknown)).toBeNull();
    }
  });

  it("hashes according to the credential kind", () => {
    const t = generateToken();
    expect(hashParsedCredential({ kind: "token", value: t }).equals(hashToken(t))).toBe(true);
    expect(hashParsedCredential({ kind: "code", value: "ABCDEFGHJKMNPQRSTVWX" }).equals(hashManualCode("ABCDEFGHJKMNPQRSTVWX"))).toBe(true);
  });
});

describe("verification URL", () => {
  it("puts the token in the fragment, never the path or query", () => {
    const t = generateToken();
    const url = new URL(buildVerificationUrl("https://verify.example.com/", t));
    expect(url.pathname).toBe("/verify");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#${t}`);
  });
});

describe("hashNetwork", () => {
  const pepper = "p".repeat(40);
  it("groups IPv4 addresses by /24 and is keyed", () => {
    const a = hashNetwork("203.0.113.5", pepper);
    const b = hashNetwork("203.0.113.200", pepper);
    const c = hashNetwork("203.0.114.5", pepper);
    expect(a).not.toBeNull();
    expect(a!.equals(b!)).toBe(true);
    expect(a!.equals(c!)).toBe(false);
    expect(a!).toHaveLength(16);
    expect(hashNetwork("203.0.113.5", "q".repeat(40))!.equals(a!)).toBe(false);
  });
  it("groups IPv6 by /48, handles compression, and rejects junk", () => {
    const a = hashNetwork("2001:db8:abcd:1::1", pepper);
    const b = hashNetwork("2001:0db8:abcd:ffff::2", pepper);
    const c = hashNetwork("2001:db8:abce:1::1", pepper);
    expect(a!.equals(b!)).toBe(true);
    expect(a!.equals(c!)).toBe(false);
    expect(hashNetwork("not-an-ip", pepper)).toBeNull();
    expect(hashNetwork(null, pepper)).toBeNull();
    expect(hashNetwork("", pepper)).toBeNull();
  });
});
