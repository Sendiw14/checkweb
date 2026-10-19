import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimal .env parser (no dependency). Real environment variables win. */
function load(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = resolve(process.cwd(), process.env.E2E_ENV_FILE ?? ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...out, ...(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>) };
}

const env = load();
const need = (k: string) => {
  const v = env[k];
  if (!v) throw new Error(`e2e needs ${k}. Start the local stack (npm run dev:stack) or point E2E_ENV_FILE at an env file.`);
  return v;
};

export const E2E = {
  baseURL: env.E2E_BASE_URL ?? "http://localhost:3000",
  adminDb: () => need("DATABASE_ADMIN_URL"),
  supabaseUrl: () => need("SUPABASE_URL"),
  serviceKey: () => need("SUPABASE_SERVICE_ROLE_KEY"),
  stateDir: resolve(process.cwd(), ".local/e2e"),
};
