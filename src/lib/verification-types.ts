/**
 * The public verification contract, shared by the API route and the browser UI.
 * Keep it minimal: everything here may be seen by anyone holding a label.
 */
export type PublicStatus =
  | "recognized_first"
  | "recognized_repeat"
  | "suspicious"
  | "recalled"
  | "quarantined"
  | "not_released"
  | "retired"
  | "revoked"
  | "invalid"
  | "malformed"
  | "rate_limited"
  | "unavailable"
  | "error";

export const PUBLIC_STATUSES = [
  "recognized_first", "recognized_repeat", "suspicious", "recalled", "quarantined", "not_released",
  "retired", "revoked", "invalid", "malformed", "rate_limited", "unavailable", "error",
] as const satisfies readonly PublicStatus[];

export type PublicProduct = {
  name: string;
  partNumber: string;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

export type PublicRecall = {
  reference: string;
  title: string;
  /** Approved customer-facing text exactly as entered by staff. Never generated. */
  instructions: string;
  issuedAt: string | null;
};

export type PublicVerification = {
  status: PublicStatus;
  /** Short reference a customer can quote to support. Not a secret. */
  requestId: string;
  /** Human-readable serial printed on the label. */
  reference?: string;
  product?: PublicProduct;
  /** Set when the code was verified before (repeat / suspicious). */
  firstVerifiedAt?: string | null;
  previousScanCount?: number;
  recall?: PublicRecall;
  retryAfterSeconds?: number;
};

export const RECOGNIZED_STATUSES: readonly PublicStatus[] = ["recognized_first", "recognized_repeat", "suspicious"];

export function shortRequestRef(requestId: string): string {
  return requestId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Whatever came back from /api/verify (or from a proxy, CDN or error page standing in for it) becomes a
 * well-formed PublicVerification. An unknown status never renders as a verdict: it degrades to an honest
 * "unavailable" (5xx) or "error" state. Missing or malformed fields are dropped rather than trusted.
 */
export function normalizeVerifyResponse(body: unknown, httpStatus: number, fallbackRequestId: string): PublicVerification {
  const fail = (): PublicVerification => ({ status: httpStatus >= 500 ? "unavailable" : "error", requestId: fallbackRequestId });
  if (!isObj(body) || typeof body.status !== "string" || !(PUBLIC_STATUSES as readonly string[]).includes(body.status)) return fail();

  const out: PublicVerification = { status: body.status as PublicStatus, requestId: str(body.requestId) || fallbackRequestId };
  if (str(body.reference)) out.reference = str(body.reference);
  if (isObj(body.product) && str(body.product.name) !== undefined && str(body.product.partNumber) !== undefined) {
    out.product = {
      name: str(body.product.name)!, partNumber: str(body.product.partNumber)!,
      brand: str(body.product.brand) ?? null, category: str(body.product.category) ?? null, imageUrl: str(body.product.imageUrl) ?? null,
    };
  }
  if (body.firstVerifiedAt === null || str(body.firstVerifiedAt)) out.firstVerifiedAt = (body.firstVerifiedAt as string | null) ?? null;
  if (typeof body.previousScanCount === "number" && Number.isFinite(body.previousScanCount) && body.previousScanCount >= 0) out.previousScanCount = Math.floor(body.previousScanCount);
  if (isObj(body.recall) && str(body.recall.reference) && str(body.recall.title) && str(body.recall.instructions) !== undefined) {
    out.recall = { reference: str(body.recall.reference)!, title: str(body.recall.title)!, instructions: str(body.recall.instructions)!, issuedAt: str(body.recall.issuedAt) ?? null };
  }
  if (typeof body.retryAfterSeconds === "number" && Number.isFinite(body.retryAfterSeconds) && body.retryAfterSeconds > 0) out.retryAfterSeconds = Math.floor(body.retryAfterSeconds);
  return out;
}
