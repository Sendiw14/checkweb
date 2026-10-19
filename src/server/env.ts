import "server-only";
import { z } from "zod";

/**
 * Validated, lazily-parsed server configuration. Nothing here is exposed to the
 * browser: there are deliberately no NEXT_PUBLIC_ variables in this project.
 * Error messages name the offending variables but never print their values.
 */
const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  VERIFIER_DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(["disable", "verify", "no-verify"]).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  PUBLIC_SITE_URL: z.url(),
  NETWORK_HASH_PEPPER: z.string().min(32, "must be at least 32 characters"),

  ARTIFACT_STORAGE: z.enum(["supabase", "local"]).default("supabase"),
  LOCAL_STORAGE_DIR: z.string().default(".local-storage"),

  CRON_SECRET: z.string().min(24).optional(),
  REQUIRE_MFA_FOR_PRIVILEGED: bool,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid server configuration: ${problems.join("; ")}`);
    this.name = "ConfigError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`));
  }
  const env = result.data;
  const problems: string[] = [];
  if (env.NODE_ENV === "production") {
    if (!env.PUBLIC_SITE_URL.startsWith("https://")) problems.push("PUBLIC_SITE_URL must use https in production");
    if (env.ARTIFACT_STORAGE === "local") problems.push("ARTIFACT_STORAGE=local is not allowed in production");
    if (env.DATABASE_SSL === "no-verify") problems.push("DATABASE_SSL=no-verify is not allowed in production");
    if (!env.CRON_SECRET) problems.push("CRON_SECRET is required in production");
  }
  if (problems.length) throw new ConfigError(problems);
  return env;
}

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper. */
export function resetEnvCache() {
  cached = null;
}
