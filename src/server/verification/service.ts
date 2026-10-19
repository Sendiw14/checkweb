import "server-only";
import { getEnv } from "@/server/env";
import { verifierPool, isUnavailableError, pgErrorCode } from "@/server/db/pool";
import { describeClient } from "@/server/http/client-info";
import { log } from "@/server/logger";
import { LIMITS } from "@/server/ratelimit";
import { hashParsedCredential, parseCredential } from "@/server/security/tokens";
import { productImageUrl } from "@/server/storage/images";
import type { PublicVerification } from "@/lib/verification-types";
import { toPublicResult, type RawVerification } from "./public-result";

export type VerificationResponse = { httpStatus: number; body: PublicVerification; retryAfter?: number };

/**
 * Orchestrates one public verification:
 * validate -> rate limit -> single transactional DB call -> allow-listed response.
 * It never returns a success unless the database actually answered.
 */
export async function verifyCredential(input: { credential: unknown; headers: Headers; requestId: string }): Promise<VerificationResponse> {
  const { requestId } = input;
  const env = getEnv();
  const client = describeClient(input.headers, env.NETWORK_HASH_PEPPER);
  const parsed = parseCredential(input.credential);

  if (!parsed) {
    // Counts toward the invalid-attempt budget, best effort (no DB needed to answer).
    void consumeInvalidBudget(client.rateKey).catch(() => {});
    return { httpStatus: 400, body: { requestId, status: "malformed" } };
  }

  const pool = verifierPool();
  try {
    const { rows: gate } = await pool.query<{ per_ip: boolean; global: boolean; invalid_ok: boolean; retry: Date }>(
      `select (select allowed from public.rate_limit_hit($1, $2, $3)) as per_ip,
              (select allowed from public.rate_limit_hit($4, $5, $6)) as global,
              public.rate_limit_peek($7, $8, $9) as invalid_ok,
              now() + make_interval(secs => $2) as retry`,
      [
        `verify:ip:${client.rateKey}`, LIMITS.verifyPerMinute.window, LIMITS.verifyPerMinute.limit,
        "verify:all", LIMITS.verifyGlobalPerMinute.window, LIMITS.verifyGlobalPerMinute.limit,
        `invalid:ip:${client.rateKey}`, LIMITS.invalidAttempts.window, LIMITS.invalidAttempts.limit,
      ],
    );
    const g = gate[0]!;
    if (!g.per_ip || !g.global || !g.invalid_ok) {
      const retryAfter = !g.invalid_ok ? LIMITS.invalidAttempts.window : LIMITS.verifyPerMinute.window;
      return { httpStatus: 429, body: { requestId, status: "rate_limited", retryAfterSeconds: retryAfter }, retryAfter };
    }

    const channel = client.uaClass === "bot" ? "automated" : "customer";
    const { rows } = await pool.query<{ r: RawVerification }>(
      "select public.verify_part_token($1, $2, $3, $4, $5, $6, $7, null) as r",
      [hashParsedCredential(parsed), parsed.kind, channel, requestId, client.networkHash, client.country, client.uaClass],
    );
    const raw = rows[0]!.r;

    // The database is healthy here, so account for the failed attempt before answering;
    // otherwise a fast client could slip extra guesses past the budget.
    if (raw.result === "invalid") await consumeInvalidBudget(client.rateKey).catch(() => {});

    return toPublicResult(raw, { requestId, imageUrl: productImageUrl });
  } catch (err) {
    // Only an error class and a request id are logged: never the credential, never the SQL parameters.
    log.error("verify.failed", { requestId, code: pgErrorCode(err), unavailable: isUnavailableError(err) });
    if (isUnavailableError(err)) {
      return { httpStatus: 503, body: { requestId, status: "unavailable", retryAfterSeconds: 30 }, retryAfter: 30 };
    }
    return { httpStatus: 500, body: { requestId, status: "error" } };
  }
}

async function consumeInvalidBudget(rateKey: string) {
  await verifierPool().query("select * from public.rate_limit_hit($1, $2, $3)", [
    `invalid:ip:${rateKey}`, LIMITS.invalidAttempts.window, LIMITS.invalidAttempts.limit,
  ]);
}
