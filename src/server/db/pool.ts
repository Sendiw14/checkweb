import "server-only";
import pg from "pg";
import { getEnv } from "@/server/env";

// bigint (int8) -> number. Counters and identity ids stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

type PoolName = "app" | "verifier";
const registry = globalThis as unknown as { __pgPools?: Partial<Record<PoolName, pg.Pool>> };

function sslFor(connectionString: string): pg.ConnectionConfig["ssl"] {
  const env = getEnv();
  const host = new URL(connectionString).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const mode = env.DATABASE_SSL ?? (local ? "disable" : "verify");
  if (mode === "disable") return false;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true } : { rejectUnauthorized: true };
}

function make(name: PoolName): pg.Pool {
  const env = getEnv();
  const raw = name === "verifier" ? (env.VERIFIER_DATABASE_URL ?? env.DATABASE_URL) : env.DATABASE_URL;
  // `sslmode` in the URL would override our explicit TLS settings.
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: sslFor(raw),
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Server-side limits are role settings (migration 20261019000800), which work through any pooler.
    // This client-side guard only covers a database that stops answering at all.
    query_timeout: 20_000,
    application_name: name === "verifier" ? "authenticity-verify" : "authenticity-app",
  });
  // An idle-client error must not crash the process.
  pool.on("error", () => {});
  return pool;
}

export function appPool(): pg.Pool {
  const pools = (registry.__pgPools ??= {});
  return (pools.app ??= make("app"));
}

export function verifierPool(): pg.Pool {
  const pools = (registry.__pgPools ??= {});
  return (pools.verifier ??= make("verifier"));
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>, pool: pg.Pool = appPool()): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres error classification used across route handlers and actions. */
export function pgErrorCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : undefined;
}

/** Connection-level problems (as opposed to constraint violations). */
export function isUnavailableError(err: unknown): boolean {
  const code = pgErrorCode(err);
  if (!code) return err instanceof Error && /timeout|ECONN|ENOTFOUND|EAI_AGAIN|terminat|Connection/i.test(err.message);
  return code.startsWith("08") || code.startsWith("53") || code.startsWith("57") || ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET"].includes(code);
}

/** Closes every pool (scripts and tests; serverless runtimes just let connections lapse). */
export async function closePools(): Promise<void> {
  const pools = registry.__pgPools;
  if (!pools) return;
  await Promise.all(Object.values(pools).map((p) => p?.end()));
  registry.__pgPools = {};
}
