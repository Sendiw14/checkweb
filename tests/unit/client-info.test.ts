import { describe, expect, it } from "vitest";
import { classifyUserAgent, clientCountry, clientIp, describeClient } from "@/server/http/client-info";

describe("classifyUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1", "ios"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36", "android"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "desktop"],
    ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "bot"],
    ["WhatsApp/2.23.20.0", "bot"],
    ["curl/8.4.0", "bot"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "bot"],
    ["", "other"],
  ])("%s -> %s", (ua, expected) => expect(classifyUserAgent(ua)).toBe(expected));
  it("treats a missing header as other", () => expect(classifyUserAgent(null)).toBe("other"));
});

describe("client network helpers", () => {
  it("prefers x-real-ip, falls back to the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.1" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }))).toBe("203.0.113.1");
    expect(clientIp(new Headers())).toBeNull();
  });
  it("accepts only 2-letter country codes", () => {
    expect(clientCountry(new Headers({ "x-vercel-ip-country": "lk" }))).toBe("LK");
    expect(clientCountry(new Headers({ "x-vercel-ip-country": "XX" }))).toBeNull();
    expect(clientCountry(new Headers({ "x-vercel-ip-country": "<script>" }))).toBeNull();
  });
  it("never stores or exposes a raw IP: rate key and network hash are keyed digests", () => {
    const pepper = "x".repeat(40);
    const c = describeClient(new Headers({ "x-real-ip": "203.0.113.9", "user-agent": "Mozilla/5.0 (iPhone)" }), pepper);
    expect(c.rateKey).toMatch(/^[0-9a-f]{24}$/);
    expect(c.rateKey).not.toContain("203");
    expect(c.networkHash).toHaveLength(16);
    expect(c.uaClass).toBe("ios");
    expect(describeClient(new Headers(), pepper)).toMatchObject({ rateKey: "unknown", networkHash: null });
  });
});
