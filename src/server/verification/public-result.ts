import type { PublicProduct, PublicRecall, PublicVerification } from "@/lib/verification-types";
import type { VerificationResult } from "@/server/domain/enums";

/** Shape returned by public.verify_part_token (see supabase/migrations). */
export type RawVerification = {
  result: VerificationResult;
  eventId: number;
  channel?: string;
  riskReasons?: string[];
  unit?: { serial: string; firstVerifiedAt: string | null; previousScanCount: number; lifecycle: string };
  product?: { name: string; partNumber: string; brand: string | null; category: string | null; imagePath: string | null };
  recall?: { reference: string; title: string; instructions: string; issuedAt: string | null } | null;
};

export type ShapeContext = { requestId: string; imageUrl: (path: string | null | undefined) => string | null };

function productOf(raw: RawVerification, ctx: ShapeContext): PublicProduct | undefined {
  if (!raw.product) return undefined;
  return {
    name: raw.product.name,
    partNumber: raw.product.partNumber,
    brand: raw.product.brand,
    category: raw.product.category,
    imageUrl: ctx.imageUrl(raw.product.imagePath),
  };
}

/**
 * Decide, per outcome, exactly what a member of the public may see.
 * Anything not copied here (risk reasons, event ids, lifecycle, counters of
 * other kinds, internal ids) cannot leak, because this is an allow-list.
 */
export function toPublicResult(raw: RawVerification, ctx: ShapeContext): { httpStatus: number; body: PublicVerification } {
  const base = { requestId: ctx.requestId };

  switch (raw.result) {
    case "invalid":
      return { httpStatus: 404, body: { ...base, status: "invalid" } };

    case "recognized_first":
      return {
        httpStatus: 200,
        body: { ...base, status: "recognized_first", reference: raw.unit?.serial, product: productOf(raw, ctx) },
      };

    case "recognized_repeat":
    case "suspicious":
      // "suspicious" is shown to the customer as a neutral observation (see UI copy);
      // the risk reasons themselves never leave the server.
      return {
        httpStatus: 200,
        body: {
          ...base,
          status: raw.result,
          reference: raw.unit?.serial,
          product: productOf(raw, ctx),
          firstVerifiedAt: raw.unit?.firstVerifiedAt ?? null,
          previousScanCount: raw.unit?.previousScanCount ?? 0,
        },
      };

    case "recalled": {
      const recall: PublicRecall | undefined = raw.recall
        ? { reference: raw.recall.reference, title: raw.recall.title, instructions: raw.recall.instructions, issuedAt: raw.recall.issuedAt }
        : undefined;
      return { httpStatus: 200, body: { ...base, status: "recalled", reference: raw.unit?.serial, product: productOf(raw, ctx), recall } };
    }

    case "quarantined":
    case "not_released":
    case "retired":
      return { httpStatus: 200, body: { ...base, status: raw.result, reference: raw.unit?.serial, product: productOf(raw, ctx) } };

    case "revoked":
      // A withdrawn credential gets no product detail at all.
      return { httpStatus: 200, body: { ...base, status: "revoked" } };

    default: {
      const _exhaustive: never = raw.result;
      void _exhaustive;
      return { httpStatus: 500, body: { ...base, status: "error" } };
    }
  }
}
