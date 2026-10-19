import { timingSafeEqual } from "node:crypto";
import { appPool } from "@/server/db/pool";
import { getEnv } from "@/server/env";
import { log } from "@/server/logger";
import { defaultWorkerContext } from "@/server/labels/context";
import { processNextChunk, purgeExpiredArtifacts } from "@/server/labels/worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduled maintenance (Vercel Cron, see vercel.json):
 *  1. finish label jobs nobody is driving (browser closed mid-run),
 *  2. delete expired label PDFs from private storage,
 *  3. apply retention: scrub old network identifiers, anonymise old support cases, drop old rate-limit rows.
 */
export async function GET(request: Request) {
  if (!authorised(request)) return new Response("Unauthorized", { status: 401 });
  const started = Date.now();
  const ctx = await defaultWorkerContext();
  let chunks = 0;

  const stale = await appPool().query<{ id: string }>(
    "select id from public.label_jobs where state in ('queued', 'running') and updated_at < now() - interval '60 seconds' order by created_at limit 5");
  for (const job of stale.rows) {
    while (Date.now() - started < 40_000) {
      const r = await processNextChunk(job.id, ctx);
      chunks++;
      if (r.status !== "progress") break;
    }
  }
  const purgedArtifacts = await purgeExpiredArtifacts(ctx.store);
  const retention = (await appPool().query<{ r: unknown }>("select public.purge_expired_data() as r")).rows[0]!.r;
  log.info("cron.maintenance", { chunks, purgedArtifacts, retention, ms: Date.now() - started });
  return Response.json({ chunks, purgedArtifacts, retention }, { headers: { "Cache-Control": "no-store" } });
}
