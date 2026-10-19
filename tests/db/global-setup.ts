import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { migrate } from "../../scripts/lib/migrate";
import { TEST_DB, adminUrl } from "./support/urls";

/**
 * Creates a brand-new database, applies the Supabase shim + every migration,
 * and gives the least-privilege roles login passwords. Runs once per vitest run.
 */
export default async function setup() {
  const root = new pg.Client({ connectionString: adminUrl("postgres") });
  await root.connect();
  try {
    await root.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [TEST_DB]);
    await root.query(`drop database if exists ${TEST_DB}`);
    await root.query(`create database ${TEST_DB}`);
  } finally {
    await root.end();
  }

  const client = new pg.Client({ connectionString: adminUrl(TEST_DB) });
  await client.connect();
  try {
    await client.query(readFileSync(resolve(__dirname, "support/supabase-shim.sql"), "utf8"));
  } finally {
    await client.end();
  }

  await migrate(adminUrl(TEST_DB), resolve(__dirname, "../../supabase/migrations"));

  const after = new pg.Client({ connectionString: adminUrl(TEST_DB) });
  await after.connect();
  try {
    await after.query(`alter role app_server login password 'app_server_dev_pw'`);
    await after.query(`alter role app_verifier login password 'app_verifier_dev_pw'`);
  } finally {
    await after.end();
  }
}
