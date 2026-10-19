import { randomUUID } from "node:crypto";
import { verifyCredential } from "@/server/verification/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 2048;

const SECURE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

function respond(body: unknown, status: number, requestId: string, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...SECURE_HEADERS, "X-Request-Id": requestId, ...extra } });
}

/**
 * POST /api/verify  { "credential": "<43-char token | manual code>" }
 *
 * The token travels in the request body over HTTPS, never in a URL, so it is
 * absent from access logs, CDN logs and Referer headers.
 */
export async function POST(request: Request) {
  const requestId = randomUUID();

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return respond({ requestId, status: "malformed" }, 415, requestId);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return respond({ requestId, status: "malformed" }, 413, requestId);

  let credential: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return respond({ requestId, status: "malformed" }, 413, requestId);
    const parsed: unknown = JSON.parse(text);
    credential = typeof parsed === "object" && parsed !== null ? (parsed as { credential?: unknown }).credential : undefined;
  } catch {
    return respond({ requestId, status: "malformed" }, 400, requestId);
  }

  const result = await verifyCredential({ credential, headers: request.headers, requestId });
  return respond(
    result.body,
    result.httpStatus,
    requestId,
    result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {},
  );
}

// Everything else is explicitly unsupported (Next answers 405 for unlisted methods).
