import { describe, expect, it } from "vitest";
import { ConfigError, parseEnv } from "@/server/env";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://u:p@localhost:5432/db",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "a".repeat(30),
  SUPABASE_SERVICE_ROLE_KEY: "b".repeat(30),
  PUBLIC_SITE_URL: "http://localhost:3000",
  NETWORK_HASH_PEPPER: "p".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a valid development configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.ARTIFACT_STORAGE).toBe("supabase");
    expect(env.REQUIRE_MFA_FOR_PRIVILEGED).toBe(false);
    expect(env.DATABASE_POOL_MAX).toBe(5);
  });

  it("names every missing variable but never prints values", () => {
    try {
      parseEnv({ DATABASE_URL: "postgres://u:supersecretpw@h/db", NETWORK_HASH_PEPPER: "short" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/SUPABASE_URL/);
      expect(msg).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(msg).toMatch(/NETWORK_HASH_PEPPER/);
      expect(msg).not.toContain("supersecretpw");
      expect(msg).not.toContain("short");
    }
  });

  it("enforces production safety rules", () => {
    const prod = { ...valid, NODE_ENV: "production", PUBLIC_SITE_URL: "https://verify.example.com", CRON_SECRET: "c".repeat(30) };
    expect(() => parseEnv(prod)).not.toThrow();
    expect(() => parseEnv({ ...prod, PUBLIC_SITE_URL: "http://verify.example.com" })).toThrow(/https/);
    expect(() => parseEnv({ ...prod, ARTIFACT_STORAGE: "local" })).toThrow(/not allowed in production/);
    expect(() => parseEnv({ ...prod, DATABASE_SSL: "no-verify" })).toThrow(/not allowed in production/);
    expect(() => parseEnv({ ...prod, CRON_SECRET: undefined })).toThrow(/CRON_SECRET/);
  });
});
