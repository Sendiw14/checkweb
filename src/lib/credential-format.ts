/**
 * Client-safe credential syntax shared by the browser form and the server parser
 * (no Node APIs here). The server still validates independently.
 */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const CODE_LENGTH = 20;
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{20}$/; // Crockford base32: no I, L, O, U

/** Accepts typing mistakes: case, spaces/dashes, O->0, I/L->1. Returns the canonical 20 chars or null. */
export function normalizeManualCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return CODE_RE.test(cleaned) ? cleaned : null;
}

export function formatManualCode(canonical: string): string {
  return canonical.match(/.{1,4}/g)?.join("-") ?? canonical;
}

/** Strip a pasted URL down to what follows '#'. */
export function stripToCredential(raw: string): string {
  const input = raw.trim();
  const i = input.indexOf("#");
  return i >= 0 ? input.slice(i + 1).trim() : input;
}

export type CredentialShape = "token" | "code" | null;

export function credentialShape(raw: string): CredentialShape {
  if (!raw || raw.length > 512) return null;
  const input = stripToCredential(raw);
  if (TOKEN_RE.test(input)) return "token";
  return normalizeManualCode(input) ? "code" : null;
}

/** Live formatting for the manual-entry field: group codes as the person types, leave tokens/URLs alone. */
export function formatAsTyped(raw: string): string {
  if (raw.includes("#") || raw.includes("/") || raw.length > 28) return raw;
  const compact = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (compact.length > CODE_LENGTH + 4) return raw;
  return compact.match(/.{1,4}/g)?.join("-") ?? "";
}
