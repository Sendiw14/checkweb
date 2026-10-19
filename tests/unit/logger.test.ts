import { afterEach, describe, expect, it } from "vitest";
import { log, redact, redactString, setLogSink } from "@/server/logger";
import { generateToken } from "@/server/security/tokens";

describe("log redaction", () => {
  it("redacts QR tokens appearing in free text, URLs and fragments", () => {
    const t = generateToken();
    expect(redactString(`failed for ${t}`)).not.toContain(t);
    expect(redactString(`GET https://verify.example.com/verify#${t}`)).not.toContain(t);
    expect(redactString(`https://verify.example.com/verify?code=${t}`)).not.toContain(t);
  });

  it("redacts JWTs, bearer headers and connection strings", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl";
    expect(redactString(`token ${jwt}`)).not.toContain("eyJhbGci");
    expect(redactString("Authorization: Bearer abc.def.ghi")).not.toMatch(/abc\.def/);
    expect(redactString("connect postgres://user:supersecret@db.host:5432/app failed")).not.toContain("supersecret");
  });

  it("redacts sensitive keys at any depth and never prints buffers", () => {
    const out = redact({
      requestId: "ok",
      password: "hunter2",
      nested: { sessionId: "abc", token_hash: "ff", authorization: "Bearer zzz", fine: "visible", list: [{ apiKey: "k" }] },
      raw: Buffer.from("secret-bytes"),
    }) as Record<string, any>;
    expect(JSON.stringify(out)).not.toMatch(/hunter2|secret-bytes|zzz|"k"/);
    expect(out.requestId).toBe("ok");
    expect(out.nested.fine).toBe("visible");
  });

  it("serialises errors without stack traces or embedded secrets", () => {
    const t = generateToken();
    const out = redact(new Error(`bad token ${t}`)) as { message: string; stack?: string };
    expect(out.message).not.toContain(t);
    expect(out).not.toHaveProperty("stack");
  });

  const lines: string[] = [];
  afterEach(() => setLogSink((l) => process.stdout.write(l + "\n")));
  it("emits one JSON line per event with redacted fields", () => {
    setLogSink((l) => lines.push(l));
    const t = generateToken();
    log.error("verify.failed", { requestId: "r1", detail: `credential=${t}`, password: "x" });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({ level: "error", event: "verify.failed", requestId: "r1", password: "[redacted]" });
    expect(lines[0]).not.toContain(t);
  });
});
