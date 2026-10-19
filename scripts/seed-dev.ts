/**
 * DEVELOPMENT-ONLY synthetic data. Refuses to run against anything but a local
 * database (or when ALLOW_DEV_SEED=1 is set explicitly). Never run against production.
 *
 *   pnpm db:seed:dev [--units=2400]
 *
 * Writes plaintext sample credentials to .local/dev-samples.json (git-ignored) so you
 * can generate QR codes / type codes by hand. In production, plaintext tokens exist only
 * inside the generated label PDFs.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { generateManualCode, generateToken, hashManualCode, hashToken, formatManualCode, buildVerificationUrl } from "@/server/security/tokens";

const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL is required (run `pnpm dev:stack` first).");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_DEV_SEED !== "1") {
  throw new Error(`Refusing to seed non-local database host "${host}". This script creates synthetic data.`);
}
if (process.env.NODE_ENV === "production") throw new Error("Refusing to run seed in production.");

const unitsArg = Number((process.argv.find((a) => a.startsWith("--units=")) ?? "--units=2400").split("=")[1]);
const SITE = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";

pg.types.setTypeParser(20, (v) => Number(v));
const db = new pg.Pool({ connectionString: url, max: 4 });
const q = <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => db.query<T>(text, params);

const PRODUCTS = [
  { sku: "AXM-BP-2041", pn: "BP-2041", name: "Ceramic Brake Pad Set, Front", cat: "Brakes", desc: "Low-dust ceramic friction compound with chamfered edges and shims." },
  { sku: "AXM-BR-3310", pn: "BR-3310", name: "Vented Brake Rotor, 296 mm", cat: "Brakes", desc: "Coated vented rotor, balanced and ready to fit." },
  { sku: "AXM-OF-1180", pn: "OF-1180", name: "Spin-on Oil Filter", cat: "Filters", desc: "High-capacity full-flow oil filter with anti-drain-back valve." },
  { sku: "AXM-AF-2204", pn: "AF-2204", name: "Cabin Air Filter, Activated Carbon", cat: "Filters", desc: "Multi-layer carbon cabin filter." },
  { sku: "AXM-SP-0907", pn: "SP-0907", name: "Iridium Spark Plug, Set of 4", cat: "Ignition", desc: "Fine-wire iridium centre electrode." },
  { sku: "AXM-TB-5512", pn: "TB-5512", name: "Timing Belt Kit with Water Pump", cat: "Engine", desc: "Complete timing kit with tensioner, idlers and pump." },
];

async function main() {
  const staff = await q<{ user_id: string }>("select user_id from public.admin_memberships where role = 'owner' and status = 'active' limit 1");
  const actor = staff.rows[0]?.user_id ?? null;

  const productIds: Record<string, string> = {};
  for (const p of PRODUCTS) {
    const r = await q<{ id: string }>(
      `insert into public.products (sku, part_number, name, brand, category, description, created_by)
       values ($1, $2, $3, 'Axiom', $4, $5, $6)
       on conflict (lower(sku)) do update set name = excluded.name returning id`,
      [p.sku, p.pn, p.name, p.cat, p.desc, actor],
    );
    productIds[p.sku] = r.rows[0]!.id;
  }

  const batchPlan = [
    { code: "DEV-BP-2610-A", sku: "AXM-BP-2041", expected: Math.max(unitsArg, 100), register: unitsArg, release: 0.7 },
    { code: "DEV-BR-2610-A", sku: "AXM-BR-3310", expected: 600, register: 600, release: 0.5 },
    { code: "DEV-OF-2609-A", sku: "AXM-OF-1180", expected: 800, register: 800, release: 0.95 },
    { code: "DEV-SP-2610-A", sku: "AXM-SP-0907", expected: 400, register: 120, release: 0 },
  ];

  const samples: { released: { serial: string; token: string; code: string; url: string }[]; unreleased: { serial: string; token: string; code: string }[]; other: Record<string, unknown> } = { released: [], unreleased: [], other: {} };
  const batchIds: Record<string, string> = {};

  for (const b of batchPlan) {
    const existing = await q<{ id: string }>("select id from public.manufacturing_batches where lower(batch_code) = lower($1)", [b.code]);
    if (existing.rowCount) { batchIds[b.code] = existing.rows[0]!.id; continue; }
    const ins = await q<{ id: string }>(
      `insert into public.manufacturing_batches (product_id, batch_code, manufacturing_date, expected_quantity, created_by)
       values ($1, $2, current_date - 12, $3, $4) returning id`,
      [productIds[b.sku], b.code, b.expected, actor],
    );
    const batchId = ins.rows[0]!.id;
    batchIds[b.code] = batchId;
    await q("select public.register_batch_units($1, $2)", [batchId, b.register]);

    const units = (await q<{ id: string; serial_number: string }>("select id, serial_number from public.part_units where batch_id = $1 order by serial_number", [batchId])).rows;
    // Issue tokens for every unit that will get a label (all registered units except the last 10%).
    const labelled = units.slice(0, Math.floor(units.length * 0.9));
    const creds = labelled.map((u) => ({ unitId: u.id, serial: u.serial_number, token: generateToken(), code: generateManualCode() }));
    for (let i = 0; i < creds.length; i += 500) {
      const chunk = creds.slice(i, i + 500);
      await q("select public.issue_part_tokens(null, $1::uuid[], $2::bytea[], $3::bytea[], $4)", [
        chunk.map((c) => c.unitId), chunk.map((c) => hashToken(c.token)), chunk.map((c) => hashManualCode(c.code)), actor,
      ]);
    }
    const toApply = creds.slice(0, Math.floor(creds.length * 0.92));
    const ids = toApply.map((c) => c.unitId);
    await q("select public.set_label_status($1::uuid[], 'printed', $2)", [ids, actor]);
    await q("select public.set_label_status($1::uuid[], 'applied', $2)", [ids, actor]);
    await q("select public.transition_units('qc_passed', $1, null, $2, null)", [actor, batchId]);
    if (b.release > 0) {
      const releaseIds = toApply.slice(0, Math.floor(toApply.length * b.release)).map((c) => c.unitId);
      await q("select public.transition_units('released', $1, null, null, $2::uuid[])", [actor, releaseIds]);
      const tag = b.code === "DEV-BP-2610-A" ? 12 : 4;
      for (const c of toApply.slice(0, tag)) samples.released.push({ serial: c.serial, token: c.token, code: formatManualCode(c.code), url: buildVerificationUrl(SITE, c.token) });
    }
    for (const c of creds.slice(-3)) samples.unreleased.push({ serial: c.serial, token: c.token, code: formatManualCode(c.code) });
  }

  // Realistic verification history for dashboards (backdated events, dev only).
  const have = (await q<{ c: number }>("select count(*)::int c from public.verification_events")).rows[0]!.c;
  if (have < 50) {
    const rel = (await q<{ id: string; token_id: string }>(
      `select u.id, t.id as token_id from public.part_units u join public.part_tokens t on t.unit_id = u.id and t.status = 'active'
       where u.lifecycle_status = 'released' order by u.serial_number limit 400`)).rows;
    const results = ["recognized_first", "recognized_repeat", "recognized_repeat", "invalid", "recognized_first"] as const;
    const uaClasses = ["ios", "android", "android", "desktop", "ios"] as const;
    for (let day = 13; day >= 0; day--) {
      const perDay = 18 + Math.floor(Math.random() * 40) + (day < 3 ? 25 : 0);
      for (let i = 0; i < perDay; i++) {
        const r = results[Math.floor(Math.random() * results.length)]!;
        const u = rel[Math.floor(Math.random() * rel.length)]!;
        const ts = new Date(Date.now() - day * 86_400_000 - Math.floor(Math.random() * 80_000_000));
        await q(
          `insert into public.verification_events (unit_id, token_id, result, channel, credential_kind, request_id, network_hash, country, ua_class, created_at)
           values ($1, $2, $3, 'customer', 'token', $4, $5, $6, $7, $8)`,
          [r === "invalid" ? null : u.id, r === "invalid" ? null : u.token_id, r, randomUUID(), Buffer.alloc(16, Math.floor(Math.random() * 200)), ["LK", "LK", "LK", "IN", "AE"][i % 5], uaClasses[i % 5], ts],
        );
      }
    }
    // Keep unit counters consistent with the synthetic history.
    await q(`update public.part_units u set scan_count = s.c, first_verified_at = s.f, last_verified_at = s.l
             from (select unit_id, count(*)::int c, min(created_at) f, max(created_at) l from public.verification_events
                   where unit_id is not null and result like 'recognized%' and channel = 'customer' group by unit_id) s where u.id = s.unit_id`);
  }

  // A recall and a quarantined unit, so those states exist in the UI.
  const recallExists = (await q("select 1 from public.recalls where title = 'DEV: Oil filter gasket batch'")).rowCount;
  if (!recallExists) {
    const r = await q<{ id: string }>(
      `insert into public.recalls (title, reason, status, public_instructions, instructions_approved_by, instructions_approved_at, issued_at, created_by)
       values ('DEV: Oil filter gasket batch', 'Synthetic recall used for development.', 'active',
               'DEVELOPMENT SAMPLE: this text is synthetic. Stop using this filter and contact support for a free replacement.', $1, now(), now(), $1) returning id`, [actor]);
    await q("insert into public.recall_batches values ($1, $2)", [r.rows[0]!.id, batchIds["DEV-OF-2609-A"]]);
  }

  // A real rule-triggered investigation, produced by the real verification function.
  const sus = samples.released[0];
  if (sus && !(await q("select 1 from public.investigations")).rowCount) {
    for (let i = 0; i < 4; i++) {
      await q("select public.verify_part_token($1, 'token', 'customer', $2, $3, $4, 'android', null)", [hashToken(sus.token), randomUUID(), Buffer.alloc(16, 200 + i), i % 2 ? "DE" : "LK"]);
    }
  }

  // Support cases.
  if (!(await q("select 1 from public.support_cases")).rowCount) {
    await q(`insert into public.support_cases (kind, subject, message, contact_email, serial_reference, status) values
      ('question', 'Where is the code on my filter?', 'I cannot find the QR code on the oil filter I bought. Where should I look?', 'customer1@example.test', null, 'new'),
      ('suspected_counterfeit', 'Label looks different on my brake pads', 'The label font looks different from my previous set and the QR gives an error.', 'customer2@example.test', 'AXM-00000042', 'open')`);
  }

  mkdirSync(".local", { recursive: true });
  samples.other = { site: SITE, note: "Synthetic development data. Do not reuse these values anywhere real." };
  writeFileSync(".local/dev-samples.json", JSON.stringify(samples, null, 2), { mode: 0o600 });
  const c = (await q<{ products: number; batches: number; units: number; tokens: number; events: number }>(
    `select (select count(*) from public.products)::int products, (select count(*) from public.manufacturing_batches)::int batches,
            (select count(*) from public.part_units)::int units, (select count(*) from public.part_tokens)::int tokens,
            (select count(*) from public.verification_events)::int events`)).rows[0]!;
  console.log("seeded:", c, "-> sample credentials in .local/dev-samples.json");
}

main().then(() => db.end()).catch(async (e) => { console.error(e); await db.end(); process.exit(1); });
