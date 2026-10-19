import { afterAll, describe, expect, it } from "vitest";
import { admin, closePools, createBatch, createProduct, issueToken, registerUnits } from "./support/fixtures";
import { TEST_DB } from "./support/urls";

const base = `127.0.0.1:${process.env.TEST_PG_PORT ?? "5432"}/${TEST_DB}`;
Object.assign(process.env, {
  NODE_ENV: "test", DATABASE_URL: `postgres://app_server:app_server_dev_pw@${base}`, VERIFIER_DATABASE_URL: `postgres://app_verifier:app_verifier_dev_pw@${base}`,
  SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_ANON_KEY: "a".repeat(40), SUPABASE_SERVICE_ROLE_KEY: "b".repeat(40),
  PUBLIC_SITE_URL: "https://verify.example.com", NETWORK_HASH_PEPPER: "test-pepper-".padEnd(40, "x"), ARTIFACT_STORAGE: "local",
});

afterAll(async () => {
  await (await import("@/server/db/pool")).closePools();
  await closePools();
});

describe("labelableBatches: which batches the label wizard offers", () => {
  it("still offers an older batch that needs labels when 200+ newer batches do not", async () => {
    const product = await createProduct();
    const needy = await createBatch(product.id, 5);
    await registerUnits(needy.id, 3); // three never-labelled units

    // 201 NEWER batches that need nothing (no units at all). The old code applied LIMIT 200 first and
    // filtered afterwards, so these pushed `needy` out of the list.
    await admin.query(
      `insert into public.manufacturing_batches (product_id, batch_code, manufacturing_date, expected_quantity)
       select $1, 'FILLER-' || g || '-' || upper($2), current_date, 1 from generate_series(1, 201) g`, [product.id, needy.id.slice(0, 8)]);
    try {
      const { labelableBatches } = await import("@/server/repos/labels");
      const batches = await labelableBatches();
      const found = batches.find((b) => b.id === needy.id);
      expect(found, "the older batch with unlabelled units must be listed").toBeTruthy();
      expect(found).toMatchObject({ registered: 3, unlabelled: 3 });
      expect(batches.every((b) => b.unlabelled > 0)).toBe(true);
      expect(batches.length).toBeLessThanOrEqual(200);
    } finally {
      await admin.query("delete from public.manufacturing_batches where batch_code like $1", [`FILLER-%-${needy.id.slice(0, 8).toUpperCase()}`]);
    }
  });

  it("does not offer a batch whose units all have codes", async () => {
    const product = await createProduct();
    const done = await createBatch(product.id, 2);
    const units = await registerUnits(done.id, 2);
    for (const u of units) await issueToken(u.id);
    const { labelableBatches } = await import("@/server/repos/labels");
    expect((await labelableBatches()).find((b) => b.id === done.id)).toBeUndefined();
  });

  it("does not offer quarantined, on-hold or cancelled batches", async () => {
    const product = await createProduct();
    const q = await createBatch(product.id, 2); await registerUnits(q.id, 1);
    const c = await createBatch(product.id, 2); await registerUnits(c.id, 1);
    await admin.query("update public.manufacturing_batches set release_status = 'quarantined' where id = $1", [q.id]).catch(async () => {
      await admin.query("select public.transition_units('quarantined', null, 'test', $1, null)", [q.id]);
    });
    await admin.query("update public.manufacturing_batches set processing_status = 'cancelled' where id = $1", [c.id]);
    const { labelableBatches } = await import("@/server/repos/labels");
    const ids = (await labelableBatches()).map((b) => b.id);
    expect(ids).not.toContain(q.id);
    expect(ids).not.toContain(c.id);
  });
});
