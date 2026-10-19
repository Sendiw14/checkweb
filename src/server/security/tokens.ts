import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Credentials printed on a physical label.
 *
 *  - QR token:    32 bytes from the OS CSPRNG, base64url (43 chars, 256 bits).
 *                 The database stores only SHA-256(token).
 *  - Manual code: 20 Crockford-base32 chars (100 bits) for people who cannot scan.
 *                 Stored as SHA-256 with a domain-separation prefix.
 *
 * Neither value is derived from serials, product ids, timestamps or counters.
 */

const TOKEN_BYTES = 32;
export const TOKEN_LENGTH = 43; // base64url of 32 bytes without padding
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// Crockford base32: no I, L, O, U.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 20;
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{20}$/;
const CODE_HASH_DOMAIN = "qr-part-code:v1:";

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isWellFormedToken(value: string): boolean {
  return TOKEN_RE.test(value) && Buffer.from(value, "base64url").length === TOKEN_BYTES;
}

/** SHA-256 over the complete token string, as stored in part_tokens.token_hash. */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function generateManualCode(): string {
  // 256 is divisible by 32, so `byte & 31` is unbiased.
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b & 31];
  return out;
}

export function formatManualCode(canonical: string): string {
  return canonical.match(/.{1,4}/g)?.join("-") ?? canonical;
}

/**
 * Accepts what a person might type: lower case, spaces, dashes, and the usual
 * look-alike mistakes (O->0, I/L->1). Returns the canonical 20 characters or null.
 */
export function normalizeManualCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return CODE_RE.test(cleaned) ? cleaned : null;
}

export function hashManualCode(canonical: string): Buffer {
  return createHash("sha256").update(CODE_HASH_DOMAIN + canonical, "utf8").digest();
}

export type ParsedCredential = { kind: "token"; value: string } | { kind: "code"; value: string };

/**
 * Classifies whatever the customer (or the QR page) submitted. Pasted full URLs
 * are accepted: the token is taken from the fragment.
 */
export function parseCredential(raw: unknown): ParsedCredential | null {
  if (typeof raw !== "string") return null;
  let input = raw.trim();
  if (input.length === 0 || input.length > 512) return null;

  const hashIndex = input.indexOf("#");
  if (hashIndex >= 0) input = input.slice(hashIndex + 1).trim();

  if (TOKEN_RE.test(input) && isWellFormedToken(input)) return { kind: "token", value: input };
  const code = normalizeManualCode(input);
  if (code) return { kind: "code", value: code };
  return null;
}

export function hashParsedCredential(c: ParsedCredential): Buffer {
  return c.kind === "token" ? hashToken(c.value) : hashManualCode(c.value);
}

export function buildVerificationUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/verify#${token}`;
}

/**
 * Coarse, keyed hash of the client network for repeat-scan analysis.
 * IPv4 is truncated to /24 and IPv6 to /48 before hashing; the key is a server
 * secret, so the stored value cannot be reversed or joined to other datasets.
 */
export function hashNetwork(ip: string | null | undefined, pepper: string): Buffer | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  let prefix: string | null = null;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(trimmed);
  if (v4) {
    prefix = `v4:${v4[1]}.${v4[2]}.${v4[3]}`;
  } else if (trimmed.includes(":")) {
    const groups = expandIPv6(trimmed);
    if (groups) prefix = `v6:${groups.slice(0, 3).join(":")}`;
  }
  if (!prefix) return null;
  return createHmac("sha256", pepper).update(prefix).digest().subarray(0, 16);
}

function expandIPv6(ip: string): string[] | null {
  const noZone = ip.split("%")[0] ?? ip;
  const [head, tail] = noZone.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail === undefined ? [] : tail ? tail.split(":") : [];
  if (tail === undefined && headParts.length !== 8) return null;
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;
  const full = [...headParts, ...Array<string>(tail === undefined ? 0 : missing).fill("0"), ...tailParts];
  if (full.length !== 8 || !full.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return full.map((g) => g.toLowerCase().padStart(4, "0"));
}
