import { appPool } from "@/server/db/pool";

export const dynamic = "force-dynamic";

/** Liveness + database reachability. Reveals no versions, hosts or internals. */
export async function GET() {
  const started = Date.now();
  try {
    await appPool().query("select 1");
    return Response.json({ status: "ok", db: "up", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
