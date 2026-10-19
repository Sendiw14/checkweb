import "server-only";
import type { Pool, PoolClient } from "pg";
import { appPool } from "@/server/db/pool";
import type { Staff } from "@/server/auth/session";

type Db = Pool | PoolClient;

export type AuditEntry = {
  action: string; // e.g. "product.create", "batch.release", "token.revoke"
  targetType?: string;
  targetId?: string;
  /** Safe change metadata only. The database rejects anything that looks like a credential. */
  metadata?: Record<string, unknown>;
  requestId?: string;
};

/**
 * Appends to the audit log. Pass the same transaction client as the change itself so a
 * change and its audit entry commit or roll back together.
 */
export async function writeAudit(actor: Pick<Staff, "userId" | "email" | "role"> | null, entry: AuditEntry, db: Db = appPool()): Promise<void> {
  await db.query(
    `insert into public.audit_logs (actor_id, actor_email, actor_role, action, target_type, target_id, metadata, request_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actor?.userId ?? null, actor?.email ?? null, actor?.role ?? null, entry.action, entry.targetType ?? null, entry.targetId ?? null, JSON.stringify(entry.metadata ?? {}), entry.requestId ?? null],
  );
}
