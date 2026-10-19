import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { E2E } from "./env";

pg.types.setTypeParser(20, (v) => Number(v));
let pool: pg.Pool | null = null;
export const db = () => (pool ??= new pg.Pool({ connectionString: E2E.adminDb(), max: 4 }));
export async function closeDb() { await pool?.end(); pool = null; }

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const token = () => randomBytes(32).toString("base64url");
const tokenHash = (t: string) => createHash("sha256").update(t, "utf8").digest();
const manualCode = () => Array.from(randomBytes(20), (b) => CROCKFORD[b & 31]).join("");
const codeHash = (c: string) => createHash("sha256").update(`qr-part-code:v1:${c}`, "utf8").digest();
const uniq = () => randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();

export type LiveUnit = { unitId: string; serial: string; token: string; code: string; batchId: string; productId: string; productName: string; url: (base: string) => string };

/** A released unit with real credentials, built the same way the label worker does. */
export async function createLiveUnit(opts: { release?: boolean } = {}): Promise<LiveUnit> {
  const tag = uniq();
  const name = `E2E Part ${tag}`;
  const p = (await db().query("insert into public.products (sku, part_number, name, brand, category) values ($1, $2, $3, 'Axiom', 'Brakes') returning id", [`E2E-${tag}`, `E2E-PN-${tag}`, name])).rows[0];
  const b = (await db().query("insert into public.manufacturing_batches (product_id, batch_code, manufacturing_date, expected_quantity) values ($1, $2, current_date, 5) returning id", [p.id, `E2E-B-${tag}`])).rows[0];
  await db().query("select public.register_batch_units($1, 1)", [b.id]);
  const u = (await db().query("select id, serial_number from public.part_units where batch_id = $1", [b.id])).rows[0];
  const t = token();
  const c = manualCode();
  await db().query("select public.issue_part_tokens(null, $1::uuid[], $2::bytea[], $3::bytea[], null)", [[u.id], [tokenHash(t)], [codeHash(c)]]);
  if (opts.release !== false) {
    await db().query("select public.set_label_status($1::uuid[], 'printed', null)", [[u.id]]);
    await db().query("select public.set_label_status($1::uuid[], 'applied', null)", [[u.id]]);
    await db().query("select public.transition_units('qc_passed', null, null, null, $1::uuid[])", [[u.id]]);
    await db().query("select public.transition_units('released', null, null, null, $1::uuid[])", [[u.id]]);
  }
  return { unitId: u.id, serial: u.serial_number, token: t, code: c, batchId: b.id, productId: p.id, productName: name, url: (base) => `${base.replace(/\/$/, "")}/verify#${t}` };
}

export const formatCode = (c: string) => c.replace(/(.{4})(?=.)/g, "$1-");

export async function revoke(unitId: string) {
  await db().query("select public.revoke_part_token($1, null, 'e2e')", [unitId]);
}
export async function quarantine(unitId: string) {
  await db().query("select public.transition_units('quarantined', null, 'e2e hold', null, $1::uuid[])", [[unitId]]);
}
export async function retire(unitId: string) {
  await db().query("select public.transition_units('retired', null, 'e2e retire', null, $1::uuid[])", [[unitId]]);
}
export async function recallUnit(unitId: string, instructions: string) {
  const r = (await db().query(
    `insert into public.recalls (title, reason, status, public_instructions, instructions_approved_at, issued_at)
     values ('E2E recall', 'e2e', 'active', $1, now(), now()) returning id`, [instructions])).rows[0];
  await db().query("insert into public.recall_units values ($1, $2)", [r.id, unitId]);
  return r.id as string;
}
export async function closeRecall(id: string) {
  await db().query("update public.recalls set status = 'closed', closed_at = now() where id = $1", [id]);
}
export async function resetRateLimits() { await db().query("delete from public.rate_limit_counters"); }
export const randomWellFormedToken = token;
