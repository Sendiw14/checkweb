import "server-only";
import { appPool } from "@/server/db/pool";
import { can } from "@/server/auth/permissions";
import type { Staff } from "@/server/auth/session";
import type { AlertItem } from "@/components/admin/alerts-menu";

/** Things that need a human, filtered by what the caller is allowed to see. */
export async function getAlerts(staff: Staff): Promise<AlertItem[]> {
  const out: AlertItem[] = [];
  const pool = appPool();
  try {
    if (can(staff.role, "investigations.read")) {
      const { rows } = await pool.query<{ open: number; high: number }>(
        "select count(*)::int open, count(*) filter (where severity = 'high')::int high from public.investigations where status in ('open', 'in_review')",
      );
      const r = rows[0]!;
      if (r.open > 0) out.push({ id: "inv", tone: r.high ? "danger" : "warning", title: `${r.open} open investigation${r.open === 1 ? "" : "s"}`, detail: r.high ? `${r.high} high severity` : "Unusual scan patterns to review", href: "/admin/investigations" });
    }
    if (can(staff.role, "labels.read")) {
      const { rows } = await pool.query<{ failed: number; running: number }>(
        "select count(*) filter (where state = 'failed' and created_at > now() - interval '7 days')::int failed, count(*) filter (where state in ('queued','running'))::int running from public.label_jobs",
      );
      const r = rows[0]!;
      if (r.failed > 0) out.push({ id: "jobs-failed", tone: "danger", title: `${r.failed} label job${r.failed === 1 ? "" : "s"} failed`, detail: "Review the error and retry", href: "/admin/labels" });
      if (r.running > 0) out.push({ id: "jobs-running", tone: "info", title: `${r.running} label job${r.running === 1 ? "" : "s"} in progress`, detail: "Generating print-ready PDFs", href: "/admin/labels" });
    }
    if (can(staff.role, "support.read")) {
      const { rows } = await pool.query<{ n: number }>("select count(*)::int n from public.support_cases where status = 'new'");
      if (rows[0]!.n > 0) out.push({ id: "support", tone: "info", title: `${rows[0]!.n} new support case${rows[0]!.n === 1 ? "" : "s"}`, detail: "Waiting for a first reply", href: "/admin/support" });
    }
  } catch {
    // Alerts are a convenience; never let them break the page.
  }
  return out;
}
