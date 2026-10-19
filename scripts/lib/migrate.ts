import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export type MigrateResult = { applied: string[]; skipped: string[] };

/**
 * Minimal migration runner. It records applied versions in the same table the
 * Supabase CLI uses (`supabase_migrations.schema_migrations`), so either tool
 * can be used against the same database.
 */
export async function migrate(connectionString: string, dir: string, log: (m: string) => void = () => {}): Promise<MigrateResult> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query("create schema if not exists supabase_migrations");
    await client.query(`create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text)`);
    const done = new Set<string>(
      (await client.query<{ version: string }>("select version from supabase_migrations.schema_migrations")).rows.map((r) => r.version),
    );
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const match = /^(\d{14})_(.+)\.sql$/.exec(file);
      if (!match) throw new Error(`Migration file name must be <14-digit version>_<name>.sql: ${file}`);
      const [, version, name] = match as unknown as [string, string, string];
      if (done.has(version)) {
        skipped.push(file);
        continue;
      }
      const sql = readFileSync(join(dir, file), "utf8");
      log(`applying ${file}`);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
          [version, name, [sql]],
        );
        await client.query("commit");
        applied.push(file);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return { applied, skipped };
}
