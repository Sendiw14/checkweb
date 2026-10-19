import { appPool } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { ForbiddenError, assertPermission } from "@/server/auth/guards";
import { can } from "@/server/auth/permissions";
import { toCsv } from "@/server/csv";
import { LIMITS, hit } from "@/server/ratelimit";
import { resolveRange } from "@/server/repos/reports";

export const dynamic = "force-dynamic";
const MAX_ROWS = 50_000;
const H = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/**
 * CSV export, protected by `reports.export`, rate-limited and audited. Never includes token hashes,
 * raw network identifiers, secrets or customer contact details. Cells are formula-injection safe.
 */
export async function GET(request: Request) {
  let staff;
  try { staff = await assertPermission("reports.export"); }
  catch (e) { if (e instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: e.permission === "authenticated" ? 401 : 403, headers: H }); throw e; }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const range = resolveRange({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined });
  const rl = await hit(`export:${staff.userId}`, LIMITS.exports.window, LIMITS.exports.limit);
  if (!rl.allowed) return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...H, "Retry-After": String(rl.retryAfterSeconds) } });

  const pool = appPool();
  let csv: string;
  let rowCount = 0;
  if (kind === "events") {
    if (!can(staff.role, "scans.read")) return Response.json({ error: "forbidden" }, { status: 403, headers: H });
    const signals = can(staff.role, "security.signals");
    const { rows } = await pool.query(
      `select e.id, e.created_at, e.result, e.channel, u.serial_number, p.name as product, p.part_number, b.batch_code, e.country, e.ua_class${signals ? ", e.risk_score, array_to_string(e.risk_reasons, ' ') as risk_reasons" : ""}
       from public.verification_events e left join public.part_units u on u.id = e.unit_id left join public.products p on p.id = u.product_id left join public.manufacturing_batches b on b.id = u.batch_id
       where e.created_at >= ($1::date at time zone 'UTC') and e.created_at < (($2::date + 1) at time zone 'UTC') order by e.id desc limit ${MAX_ROWS}`, [range.from, range.to]);
    rowCount = rows.length;
    csv = toCsv(["event_id", "time_utc", "outcome", "channel", "serial", "product", "part_number", "batch", "country", "device_class", ...(signals ? ["risk_score", "risk_signals"] : [])], rows.map((r) => [r.id, r.created_at, r.result, r.channel, r.serial_number, r.product, r.part_number, r.batch_code, r.country, r.ua_class, ...(signals ? [r.risk_score, r.risk_reasons] : [])]));
  } else if (kind === "units") {
    if (!can(staff.role, "units.read")) return Response.json({ error: "forbidden" }, { status: 403, headers: H });
    const { rows } = await pool.query(
      `select u.serial_number, p.sku, p.name, b.batch_code, u.lifecycle_status, u.label_status, u.scan_count, u.first_verified_at, u.last_verified_at
       from public.part_units u join public.products p on p.id = u.product_id join public.manufacturing_batches b on b.id = u.batch_id order by u.serial_number limit ${MAX_ROWS}`);
    rowCount = rows.length;
    csv = toCsv(["serial", "sku", "product", "batch", "lifecycle", "label", "customer_checks", "first_checked_utc", "last_checked_utc"], rows.map((r) => [r.serial_number, r.sku, r.name, r.batch_code, r.lifecycle_status, r.label_status, r.scan_count, r.first_verified_at, r.last_verified_at]));
  } else if (kind === "audit") {
    if (!can(staff.role, "audit.read")) return Response.json({ error: "forbidden" }, { status: 403, headers: H });
    const { rows } = await pool.query(
      `select id, created_at, actor_email, actor_role, action, target_type, target_id, metadata from public.audit_logs
       where created_at >= ($1::date at time zone 'UTC') and created_at < (($2::date + 1) at time zone 'UTC') order by id desc limit ${MAX_ROWS}`, [range.from, range.to]);
    rowCount = rows.length;
    csv = toCsv(["id", "time_utc", "actor", "role", "action", "target_type", "target_id", "details"], rows.map((r) => [r.id, r.created_at, r.actor_email, r.actor_role, r.action, r.target_type, r.target_id, r.metadata]));
  } else {
    return Response.json({ error: "unknown_kind" }, { status: 400, headers: H });
  }

  await writeAudit(staff, { action: "report.export", targetType: "report", targetId: kind, metadata: { from: range.from, to: range.to, rows: rowCount } });
  return new Response(csv, { headers: { ...H, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${range.from}_to_${range.to}.csv"` } });
}
