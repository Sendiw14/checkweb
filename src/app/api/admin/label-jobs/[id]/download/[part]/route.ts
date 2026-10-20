import { appPool } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { ForbiddenError, assertPermission } from "@/server/auth/guards";
import { LIMITS, hit } from "@/server/ratelimit";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/**
 * Label PDFs contain LIVE credentials. This is the only way to get one: authorised (labels.download),
 * rate-limited, audited, and (with Supabase Storage) a 60-second signed URL rather than a public link.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; part: string }> }) {
  const { id, part } = await ctx.params;
  let staff;
  try {
    staff = await assertPermission("labels.download");
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: e.permission === "authenticated" ? 401 : 403, headers: NO_STORE });
    throw e;
  }
  const partNo = Number(part);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(partNo) || partNo < 1) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });

  const rl = await hit(`export:${staff.userId}`, LIMITS.exports.window, LIMITS.exports.limit);
  if (!rl.allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } });

  const { rows } = await appPool().query<{ storage_path: string; expires_at: Date; deleted_at: Date | null; sha256: string; bytes: number; batch_code: string }>(
    `select a.storage_path, a.expires_at, a.deleted_at, a.sha256, a.bytes, b.batch_code
     from public.label_job_artifacts a join public.label_jobs j on j.id = a.job_id join public.manufacturing_batches b on b.id = j.batch_id
     where a.job_id = $1 and a.part_no = $2`, [id, partNo]);
  const a = rows[0];
  if (!a) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  if (a.deleted_at || a.expires_at.getTime() < Date.now()) {
    return Response.json({ error: "expired", message: "This label file has expired and been deleted because it contains live codes. Use “Replace label” on the units to issue new ones." }, { status: 410, headers: NO_STORE });
  }

  await writeAudit(staff, { action: "label.download", targetType: "label_job", targetId: id, metadata: { part: partNo, sha256: a.sha256, bytes: a.bytes } });

  const filename = `labels-${a.batch_code}-part-${String(partNo).padStart(3, "0")}.pdf`;
  const store = getStore("label-artifacts");
  const signed = await store.signedUrl(a.storage_path, 60, filename);
  if (signed) return new Response(null, { status: 302, headers: { ...NO_STORE, Location: signed } });

  const bytes = await store.get(a.storage_path);
  if (!bytes) return Response.json({ error: "missing" }, { status: 404, headers: NO_STORE });
  return new Response(new Uint8Array(bytes), { headers: { ...NO_STORE, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Content-Length": String(bytes.length) } });
}
