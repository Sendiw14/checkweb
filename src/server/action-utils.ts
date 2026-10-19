import "server-only";
import type { ZodError } from "zod";
import { pgErrorCode, isUnavailableError } from "@/server/db/pool";
import { log } from "@/server/logger";
import type { ActionResult } from "@/server/auth/guards";

export function zodFieldErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

export function validationFailure(e: ZodError): ActionResult<never> {
  return { ok: false, code: "validation", error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(e) };
}

type PgError = { code?: string; constraint?: string; message?: string };

/**
 * Turns database errors into messages staff can act on, without leaking SQL.
 * P0001 / 22023 messages come from our own functions and constraints and are written to be shown.
 */
export function mapDbError(err: unknown, uniqueFields: Record<string, { field: string; message: string }> = {}): ActionResult<never> {
  const e = err as PgError;
  const code = pgErrorCode(err);
  if (code === "23505") {
    const hit = Object.entries(uniqueFields).find(([c]) => e.constraint?.includes(c));
    if (hit) return { ok: false, code: "conflict", error: hit[1].message, fieldErrors: { [hit[1].field]: hit[1].message } };
    return { ok: false, code: "conflict", error: "That already exists." };
  }
  if (code === "23503") return { ok: false, code: "conflict", error: "Another record depends on this, so the change isn't allowed." };
  if (code === "23514") return { ok: false, code: "validation", error: "A value is outside what's allowed. Check the form and try again." };
  if (code === "P0001" || code === "22023" || code === "P0002") return { ok: false, code: "conflict", error: (e.message ?? "That isn't allowed right now.").replace(/^error:\s*/i, "") };
  if (isUnavailableError(err)) return { ok: false, code: "unavailable", error: "The database couldn't be reached. Nothing was changed. Please try again." };
  log.error("action.failed", { code, constraint: e.constraint, message: e.message });
  return { ok: false, code: "failed", error: "Something went wrong and nothing was saved. Please try again." };
}
