import "server-only";
import { createHmac } from "node:crypto";
import { hashNetwork } from "@/server/security/tokens";

export type UaClass = "ios" | "android" | "desktop" | "bot" | "other";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python-requests|httpclient|headless|lighthouse|monitor|uptime|go-http-client|axios\/|node-fetch|okhttp\/[\d.]+$/i;

export function classifyUserAgent(ua: string | null | undefined): UaClass {
  if (!ua) return "other";
  if (BOT.test(ua)) return "bot";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows NT|Macintosh|X11|CrOS|Linux x86_64/i.test(ua)) return "desktop";
  return "other";
}

export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return null;
}

export function clientCountry(headers: Headers): string | null {
  const raw = headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry");
  if (!raw) return null;
  const cc = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) && cc !== "XX" ? cc : null;
}

export type ClientInfo = {
  /** Keyed hash of the full address, used only as a rate-limit bucket name. */
  rateKey: string;
  /** Keyed hash of the coarse network (/24, /48), stored on events for repeat-scan analysis. */
  networkHash: Buffer | null;
  country: string | null;
  uaClass: UaClass;
};

export function describeClient(headers: Headers, pepper: string): ClientInfo {
  const ip = clientIp(headers);
  const rateKey = ip ? createHmac("sha256", pepper).update("rl:" + ip).digest("hex").slice(0, 24) : "unknown";
  return {
    rateKey,
    networkHash: hashNetwork(ip, pepper),
    country: clientCountry(headers),
    uaClass: classifyUserAgent(headers.get("user-agent")),
  };
}
