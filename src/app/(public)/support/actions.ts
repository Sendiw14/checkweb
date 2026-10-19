"use server";
import { headers } from "next/headers";
import { appPool, isUnavailableError } from "@/server/db/pool";
import { getEnv } from "@/server/env";
import { describeClient } from "@/server/http/client-info";
import { log } from "@/server/logger";
import { LIMITS, hit } from "@/server/ratelimit";
import { supportSchema, type SupportResult } from "@/lib/support-schema";

export async function submitSupportCase(input: unknown): Promise<SupportResult> {
  const parsed = supportSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    // A filled honeypot gets a generic answer: do not teach bots what tripped them.
    if (fieldErrors.website) return { ok: false, error: "We couldn't send your message. Please try again." };
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors };
  }
  const v = parsed.data;

  const client = describeClient(await headers(), getEnv().NETWORK_HASH_PEPPER);
  try {
    const rl = await hit(`support:${client.rateKey}`, LIMITS.supportForm.window, LIMITS.supportForm.limit);
    if (!rl.allowed) {
      return { ok: false, error: "You've sent several messages recently. Please wait a while before sending another, or call us.", retryAfterSeconds: rl.retryAfterSeconds };
    }

    const body = v.ref ? `${v.message}\n\n(Part check reference: ${v.ref.replace(/[^A-Za-z0-9-]/g, "").slice(0, 16)})` : v.message;
    const serial = v.serial?.toUpperCase().replace(/\s+/g, "");
    // Link to a unit only when the serial matches exactly; the customer is never told whether it did.
    const { rows } = await appPool().query<{ reference: string }>(
      `insert into public.support_cases (kind, subject, message, contact_name, contact_email, contact_phone, serial_reference, unit_id)
       values ($1, $2, $3, $4, $5, $6, $7, (select id from public.part_units where serial_number = $7))
       returning reference`,
      [v.kind, v.subject, body, v.name ?? null, v.email?.toLowerCase() ?? null, v.phone ?? null, serial ?? null],
    );
    return { ok: true, reference: rows[0]!.reference };
  } catch (err) {
    log.error("support.submit_failed", { code: (err as { code?: string }).code, unavailable: isUnavailableError(err) });
    return { ok: false, error: "We couldn't save your message just now, so it has NOT been sent. Please try again in a few minutes or contact us directly." };
  }
}
