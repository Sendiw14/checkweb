import "server-only";
import type { Pool } from "pg";
import { appPool } from "@/server/db/pool";

export type RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * Distributed fixed-window limiter backed by PostgreSQL (public.rate_limit_hit).
 * Every serverless instance shares the same counters, unlike in-memory maps.
 * It is a floor, not a ceiling: put a WAF / platform firewall in front too.
 */
export async function hit(key: string, windowSeconds: number, limit: number, pool: Pool = appPool()): Promise<RateLimitDecision> {
  const { rows } = await pool.query<{ allowed: boolean; remaining: number; reset_at: Date }>(
    "select * from public.rate_limit_hit($1, $2, $3)",
    [key, windowSeconds, limit],
  );
  const row = rows[0]!;
  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((row.reset_at.getTime() - Date.now()) / 1000)),
  };
}

/** True while the budget is not yet exhausted; does not consume budget. */
export async function hasBudget(key: string, windowSeconds: number, limit: number, pool: Pool = appPool()): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>("select public.rate_limit_peek($1, $2, $3) as ok", [key, windowSeconds, limit]);
  return rows[0]!.ok;
}

export const LIMITS = {
  verifyPerMinute: { window: 60, limit: 60 },
  verifyGlobalPerMinute: { window: 60, limit: 1200 },
  invalidAttempts: { window: 600, limit: 20 },
  supportForm: { window: 3600, limit: 5 },
  login: { window: 900, limit: 10 },
  passwordReset: { window: 3600, limit: 5 },
  labelJobs: { window: 3600, limit: 20 },
  exports: { window: 3600, limit: 30 },
} as const;
