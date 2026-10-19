import { resolve } from "node:path";
import { migrate } from "./lib/migrate";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  console.error("DATABASE_ADMIN_URL is required (a role allowed to create schema objects, e.g. the Supabase `postgres` role).");
  process.exit(1);
}

migrate(url, resolve(process.cwd(), "supabase/migrations"), (m) => console.log(m))
  .then((r) => console.log(`done: ${r.applied.length} applied, ${r.skipped.length} already applied`))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
