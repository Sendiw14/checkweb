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
