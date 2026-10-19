import { afterAll, describe, expect, it } from "vitest";
import * as E from "@/server/domain/enums";
import { admin, closePools } from "./support/fixtures";

afterAll(closePools);

/** [table, column, TypeScript values] -- must match the CHECK constraints in the migrations. */
const MAP: [string, string, readonly string[]][] = [
  ["admin_memberships", "role", E.ROLES],
  ["admin_memberships", "status", E.MEMBERSHIP_STATUSES],
  ["manufacturing_batches", "processing_status", E.BATCH_PROCESSING_STATUSES],
  ["manufacturing_batches", "release_status", E.BATCH_RELEASE_STATUSES],
  ["part_units", "lifecycle_status", E.UNIT_LIFECYCLE_STATUSES],
  ["part_units", "label_status", E.UNIT_LABEL_STATUSES],
  ["part_tokens", "status", E.TOKEN_STATUSES],
  ["label_jobs", "kind", E.LABEL_JOB_KINDS],
  ["label_jobs", "state", E.LABEL_JOB_STATES],
  ["label_events", "event_type", E.LABEL_EVENT_TYPES],
  ["verification_events", "result", E.VERIFICATION_RESULTS],
  ["verification_events", "channel", E.VERIFICATION_CHANNELS],
  ["recalls", "status", E.RECALL_STATUSES],
  ["investigations", "origin", E.INVESTIGATION_ORIGINS],
  ["investigations", "severity", E.INVESTIGATION_SEVERITIES],
  ["investigations", "status", E.INVESTIGATION_STATUSES],
  ["support_cases", "kind", E.SUPPORT_KINDS],
  ["support_cases", "status", E.SUPPORT_STATUSES],
];

describe("TypeScript enums match database CHECK constraints", () => {
  for (const [table, column, values] of MAP) {
    it(`${table}.${column}`, async () => {
      const { rows } = await admin.query(
        `select pg_get_constraintdef(c.oid) as def
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join pg_namespace n on n.oid = t.relnamespace
         join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
         where n.nspname = 'public' and t.relname = $1 and a.attname = $2 and c.contype = 'c'`,
        [table, column],
      );
      const allValues = new Set<string>();
      for (const r of rows) for (const m of (r.def as string).matchAll(/'([a-z_]+)'::text/g)) allValues.add(m[1]!);
      expect([...allValues].sort()).toEqual([...values].sort());
    });
  }

  it("risk reasons mirror the ones the SQL function can emit", async () => {
    const { rows } = await admin.query("select pg_get_functiondef('public.verify_part_token(bytea,text,text,text,bytea,text,text,uuid)'::regprocedure) as def");
    const emitted = new Set([...(rows[0].def as string).matchAll(/array_append\(v_reasons, '([a-z_]+)'::text\)/g)].map((m) => m[1]!));
    expect([...emitted].sort()).toEqual([...E.RISK_REASONS].sort());
  });
});
