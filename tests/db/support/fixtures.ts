import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  generateManualCode,
  generateToken,
  hashManualCode,
  hashToken,
} from "@/server/security/tokens";
import { TEST_DB, adminUrl, appServerUrl, verifierUrl } from "./urls";

pg.types.setTypeParser(20, (v) => Number(v)); // bigint -> number

export const admin = new pg.Pool({ connectionString: adminUrl(TEST_DB), max: 10 });
export const appServer = new pg.Pool({ connectionString: appServerUrl(), max: 10 });
export const verifier = new pg.Pool({ connectionString: verifierUrl(), max: 20 });

export async function closePools() {
  await Promise.all([admin.end(), appServer.end(), verifier.end()]);
}

let counter = 0;
const uniq = () => `${Date.now().toString(36).toUpperCase()}${(counter++).toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6)}`;

export async function createUser(email = `user-${randomUUID()}@example.test`) {
  const id = randomUUID();
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  return { id, email };
}

export async function createStaff(role: string, status = "active") {
  const u = await createUser();
  await admin.query("insert into public.admin_memberships (user_id, email, role, status) values ($1, $2, $3, $4)", [u.id, u.email, role, status]);
  return u;
}

export async function createProduct(overrides: Record<string, unknown> = {}) {
  const tag = uniq();
  const { rows } = await admin.query(
    `insert into public.products (sku, part_number, name, brand, category)
     values ($1, $2, $3, 'Axiom', 'Brakes') returning *`,
    [overrides.sku ?? `SKU-${tag}`, overrides.part_number ?? `PN-${tag}`, overrides.name ?? `Test Part ${tag}`],
  );
  return rows[0] as { id: string; sku: string; part_number: string; name: string };
}

export async function createBatch(productId: string, expected = 100, overrides: Record<string, unknown> = {}) {
  const { rows } = await admin.query(
    `insert into public.manufacturing_batches (product_id, batch_code, manufacturing_date, expected_quantity)
     values ($1, $2, current_date, $3) returning *`,
    [productId, overrides.batch_code ?? `B-${uniq()}`, expected],
  );
  return rows[0] as { id: string; product_id: string; batch_code: string };
}

export async function registerUnits(batchId: string, quantity: number) {
  await admin.query("select public.register_batch_units($1, $2)", [batchId, quantity]);
  const { rows } = await admin.query("select id, serial_number from public.part_units where batch_id = $1 order by serial_number", [batchId]);
  return rows as { id: string; serial_number: string }[];
}

export type Issued = { unitId: string; token: string; code: string; tokenId: string };

/** Issue a token for a unit exactly like the label worker does. */
export async function issueToken(unitId: string, actor: string | null = null): Promise<Issued> {
  const token = generateToken();
  const code = generateManualCode();
  await admin.query("select public.issue_part_tokens(null, $1::uuid[], $2::bytea[], $3::bytea[], $4)", [
    [unitId],
    [hashToken(token)],
    [hashManualCode(code)],
    actor,
  ]);
  const { rows } = await admin.query("select id from public.part_tokens where unit_id = $1 and status = 'active'", [unitId]);
  return { unitId, token, code, tokenId: rows[0].id };
}

/** Walk a unit through printed -> applied -> qc_passed -> released. */
export async function releaseUnit(unitId: string, actor: string | null = null) {
  await admin.query("select public.set_label_status($1::uuid[], 'printed', $2)", [[unitId], actor]);
  await admin.query("select public.set_label_status($1::uuid[], 'applied', $2)", [[unitId], actor]);
  await admin.query("select public.transition_units('qc_passed', $1, null, null, $2::uuid[])", [actor, [unitId]]);
  await admin.query("select public.transition_units('released', $1, null, null, $2::uuid[])", [actor, [unitId]]);
}

/** A fully released, verifiable unit with its credentials. */
export async function createLiveUnit() {
  const product = await createProduct();
  const batch = await createBatch(product.id, 10);
  const [unit] = await registerUnits(batch.id, 1);
  const issued = await issueToken(unit!.id);
  await releaseUnit(unit!.id);
  return { product, batch, unit: unit!, ...issued };
}

export type RawResult = {
  result: string; eventId: number; riskReasons: string[];
  unit: { serial: string; previousScanCount: number; firstVerifiedAt: string | null; lifecycle: string };
  product: { name: string; partNumber: string; brand: string | null; category: string | null; imagePath: string | null };
  recall?: { reference: string; title: string; instructions: string; issuedAt: string | null } | null;
};

export type VerifyArgs = {
  hash: Buffer;
  kind?: "token" | "code";
  channel?: "customer" | "qc" | "automated";
  network?: Buffer | null;
  country?: string | null;
  ua?: string | null;
  pool?: pg.Pool;
};

export async function verify(a: VerifyArgs): Promise<RawResult> {
  const pool = a.pool ?? verifier;
  const { rows } = await pool.query(
    "select public.verify_part_token($1, $2, $3, $4, $5, $6, $7, null) as r",
    [a.hash, a.kind ?? "token", a.channel ?? "customer", randomUUID(), a.network ?? null, a.country ?? null, a.ua ?? null],
  );
  return rows[0].r as RawResult;
}

export const netHash = (n: number) => Buffer.alloc(16, n);

/** Run a query as a Supabase Data API role with a given JWT subject. */
export async function asRole<T>(role: "anon" | "authenticated", sub: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await admin.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    if (sub) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role })]);
    const out = await fn(c);
    await c.query("rollback");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
