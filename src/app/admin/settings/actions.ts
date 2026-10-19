"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { appPool, withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { labelSpecSchema } from "@/server/labels/spec";
import { invalidateSettingsCache } from "@/server/settings";
import { getStore } from "@/server/storage";
import { detectImageType } from "@/server/storage/image-type";
import { companySchema, retentionSchema, riskSchema } from "@/lib/schemas/settings";

const refresh = () => { invalidateSettingsCache(); revalidatePath("/", "layout"); };

const changed = (before: Record<string, unknown>, after: Record<string, unknown>) => Object.keys(after).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));

export async function saveCompany(input: unknown): Promise<ActionResult> {
  return authorized("settings.write", async (staff) => {
    const p = companySchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    const v = p.data;
    try {
      await withTransaction(async (c) => {
        const b = (await c.query("select company_name, legal_name, support_email, support_phone, website_url, privacy_url, terms_url, brand_theme, serial_prefix from public.app_settings where id for update")).rows[0];
        await c.query("update public.app_settings set company_name = $1, legal_name = $2, support_email = $3, support_phone = $4, website_url = $5, privacy_url = $6, terms_url = $7, brand_theme = $8, serial_prefix = $9, updated_by = $10 where id",
          [v.companyName, v.legalName ?? null, v.supportEmail ?? null, v.supportPhone ?? null, v.websiteUrl ?? null, v.privacyUrl ?? null, v.termsUrl ?? null, v.brandTheme, v.serialPrefix, staff.userId]);
        const after = { company_name: v.companyName, legal_name: v.legalName ?? null, support_email: v.supportEmail ?? null, support_phone: v.supportPhone ?? null, website_url: v.websiteUrl ?? null, privacy_url: v.privacyUrl ?? null, terms_url: v.termsUrl ?? null, brand_theme: v.brandTheme, serial_prefix: v.serialPrefix };
        await writeAudit(staff, { action: "settings.company", targetType: "settings", targetId: "company", metadata: { changedFields: changed(b, after) } }, c);
      });
      refresh();
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function saveLabelDefaults(input: unknown): Promise<ActionResult> {
  return authorized("settings.write", async (staff) => {
    const p = labelSpecSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      await withTransaction(async (c) => {
        await c.query("update public.app_settings set label_spec = $1, updated_by = $2 where id", [JSON.stringify(p.data), staff.userId]);
        await writeAudit(staff, { action: "settings.label_defaults", targetType: "settings", targetId: "labels", metadata: p.data as Record<string, unknown> }, c);
      });
      refresh();
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function saveRiskRules(input: unknown): Promise<ActionResult> {
  return authorized("settings.write", async (staff) => {
    const p = riskSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      await withTransaction(async (c) => {
        const b = (await c.query("select risk_thresholds from public.app_settings where id for update")).rows[0].risk_thresholds;
        await c.query("update public.app_settings set risk_thresholds = $1, updated_by = $2 where id", [JSON.stringify(p.data), staff.userId]);
        await writeAudit(staff, { action: "settings.risk_rules", targetType: "settings", targetId: "risk", metadata: { changedFields: changed(b, p.data), after: p.data } }, c);
      });
      refresh();
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function saveRetention(input: unknown): Promise<ActionResult> {
  return authorized("settings.write", async (staff) => {
    const p = retentionSchema.safeParse(input);
    if (!p.success) return validationFailure(p.error);
    try {
      await withTransaction(async (c) => {
        await c.query("update public.app_settings set retention = $1, updated_by = $2 where id", [JSON.stringify(p.data), staff.userId]);
        await writeAudit(staff, { action: "settings.retention", targetType: "settings", targetId: "retention", metadata: p.data as Record<string, unknown> }, c);
      });
      refresh();
      return { ok: true };
    } catch (err) { return mapDbError(err); }
  });
}

export async function uploadLogo(formData: FormData): Promise<ActionResult<{ path: string }>> {
  return authorized<{ path: string }>("settings.write", async (staff) => {
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) return { ok: false, code: "validation", error: "Choose an image to upload." };
    if (file.size > 1024 * 1024) return { ok: false, code: "validation", error: "Logos must be under 1 MB." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return { ok: false, code: "validation", error: "Only JPEG, PNG or WebP logos can be used." };
    const path = `brand/${randomUUID()}.${type.ext}`;
    const store = getStore("product-images");
    try { await store.put(path, bytes, type.mime); } catch { return { ok: false, code: "unavailable", error: "The logo couldn't be saved. Nothing was changed." }; }
    const old = (await appPool().query<{ logo_path: string | null }>("select logo_path from public.app_settings where id")).rows[0]?.logo_path;
    try {
      await withTransaction(async (c) => {
        await c.query("update public.app_settings set logo_path = $1, updated_by = $2 where id", [path, staff.userId]);
        await writeAudit(staff, { action: "settings.logo_set", targetType: "settings", targetId: "logo" }, c);
      });
    } catch (err) { await store.remove([path]).catch(() => {}); return mapDbError(err); }
    if (old) await store.remove([old]).catch(() => {});
    refresh();
    return { ok: true, data: { path } };
  });
}

export async function removeLogo(): Promise<ActionResult> {
  return authorized("settings.write", async (staff) => {
    const old = (await appPool().query<{ logo_path: string | null }>("select logo_path from public.app_settings where id")).rows[0]?.logo_path;
    await withTransaction(async (c) => {
      await c.query("update public.app_settings set logo_path = null, updated_by = $1 where id", [staff.userId]);
      await writeAudit(staff, { action: "settings.logo_removed", targetType: "settings", targetId: "logo" }, c);
    });
    if (old) await getStore("product-images").remove([old]).catch(() => {});
    refresh();
    return { ok: true };
  });
}
