import { createHmac } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits): what every authenticator app computes. */
export function totp(secret: string, at = Date.now()): string {
  let bits = "";
  for (const c of secret.replace(/\s+/g, "").toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("not a base32 secret");
    bits += i.toString(2).padStart(5, "0");
  }
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
