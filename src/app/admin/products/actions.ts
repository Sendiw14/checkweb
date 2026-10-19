"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { appPool, withTransaction } from "@/server/db/pool";
import { writeAudit } from "@/server/audit";
import { authorized, type ActionResult } from "@/server/auth/guards";
import { mapDbError, validationFailure } from "@/server/action-utils";
import { productSchema } from "@/lib/schemas/product";
import { getStore } from "@/server/storage";
import { MAX_IMAGE_BYTES, detectImageType } from "@/server/storage/image-type";

const UNIQUE = {
  products_sku_key: { field: "sku", message: "Another product already uses this SKU." },
  products_part_number_key: { field: "partNumber", message: "Another product already uses this part number." },
};

export async function createProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  return authorized("products.write", async (staff) => {
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    try {
      const id = await withTransaction(async (c) => {
        const { rows } = await c.query<{ id: string }>(
          "insert into public.products (sku, part_number, name, brand, category, description, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning id",
          [v.sku, v.partNumber, v.name, v.brand ?? null, v.category ?? null, v.description ?? null, staff.userId],
        );
        await writeAudit(staff, { action: "product.create", targetType: "product", targetId: rows[0]!.id, metadata: { sku: v.sku, partNumber: v.partNumber } }, c);
        return rows[0]!.id;
      });
      revalidatePath("/admin/products");
      return { ok: true, data: { id } };
    } catch (err) {
      return mapDbError(err, UNIQUE);
    }
  });
}

export async function updateProduct(id: string, input: unknown): Promise<ActionResult> {
  return authorized("products.write", async (staff) => {
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    try {
      const changed = await withTransaction(async (c) => {
        const before = (await c.query("select sku, part_number, name, brand, category, description from public.products where id = $1 for update", [id])).rows[0];
        if (!before) return null;
        await c.query("update public.products set sku = $2, part_number = $3, name = $4, brand = $5, category = $6, description = $7 where id = $1", [id, v.sku, v.partNumber, v.name, v.brand ?? null, v.category ?? null, v.description ?? null]);
        const next: Record<string, unknown> = { sku: v.sku, part_number: v.partNumber, name: v.name, brand: v.brand ?? null, category: v.category ?? null, description: v.description ?? null };
        const diff = Object.keys(next).filter((k) => (before[k] ?? null) !== next[k]);
        await writeAudit(staff, { action: "product.update", targetType: "product", targetId: id, metadata: { changedFields: diff, ...(diff.includes("sku") ? { from: before.sku, to: v.sku } : {}) } }, c);
        return diff;
      });
      if (changed === null) return { ok: false, code: "failed", error: "That product no longer exists." };
      revalidatePath("/admin/products");
      revalidatePath(`/admin/products/${id}`);
      return { ok: true };
    } catch (err) {
      return mapDbError(err, UNIQUE);
    }
  });
}

export async function setProductActive(id: string, active: boolean): Promise<ActionResult> {
  return authorized("products.write", async (staff) => {
    try {
      const res = await withTransaction(async (c) => {
        if (!active) {
          const busy = await c.query(
            `select 1 from public.label_jobs j join public.manufacturing_batches b on b.id = j.batch_id
             where b.product_id = $1 and j.state in ('queued', 'running') limit 1`, [id]);
          if (busy.rowCount) return "A label job for this product is still running. Let it finish or cancel it first.";
        }
        const r = await c.query("update public.products set is_active = $2, deactivated_at = case when $2 then null else now() end where id = $1 returning id", [id, active]);
        if (!r.rowCount) return "That product no longer exists.";
        await writeAudit(staff, { action: active ? "product.reactivate" : "product.deactivate", targetType: "product", targetId: id }, c);
        return null;
      });
      if (res) return { ok: false, code: "conflict", error: res };
      revalidatePath("/admin/products");
      revalidatePath(`/admin/products/${id}`);
      return { ok: true };
    } catch (err) {
      return mapDbError(err);
    }
  });
}

/**
 * Photo upload. The type is decided from the file's bytes (JPEG / PNG / WebP only; never SVG),
 * size is capped, and the stored name is random, so nothing the uploader controls reaches storage.
 */
export async function uploadProductImage(id: string, formData: FormData): Promise<ActionResult<{ path: string }>> {
  return authorized("products.write", async (staff) => {
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return { ok: false, code: "validation", error: "Choose an image to upload." };
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, code: "validation", error: "That image is larger than 5 MB. Resize it and try again." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return { ok: false, code: "validation", error: "Only JPEG, PNG or WebP photos can be used." };

    const existing = await appPool().query<{ image_path: string | null }>("select image_path from public.products where id = $1", [id]);
    if (!existing.rowCount) return { ok: false, code: "failed", error: "That product no longer exists." };

    const path = `products/${id}/${randomUUID()}.${type.ext}`;
    const store = getStore("product-images");
    try {
      await store.put(path, bytes, type.mime);
    } catch {
      return { ok: false, code: "unavailable", error: "The image couldn't be saved to storage. Nothing was changed. Please try again." };
    }
    try {
      await withTransaction(async (c) => {
        await c.query("update public.products set image_path = $2 where id = $1", [id, path]);
        await writeAudit(staff, { action: "product.image_set", targetType: "product", targetId: id, metadata: { bytes: bytes.length, type: type.mime } }, c);
      });
    } catch (err) {
      await store.remove([path]).catch(() => {});
      return mapDbError(err);
    }
    const old = existing.rows[0]!.image_path;
    if (old && old !== path) await store.remove([old]).catch(() => {}); // best effort: an orphan is harmless, a broken product is not
    revalidatePath(`/admin/products/${id}`);
    revalidatePath("/admin/products");
    return { ok: true, data: { path } };
  });
}

export async function removeProductImage(id: string): Promise<ActionResult> {
  return authorized("products.write", async (staff) => {
    const old = (await appPool().query<{ image_path: string | null }>("select image_path from public.products where id = $1", [id])).rows[0]?.image_path;
    if (!old) return { ok: true };
    await withTransaction(async (c) => {
      await c.query("update public.products set image_path = null where id = $1", [id]);
      await writeAudit(staff, { action: "product.image_remove", targetType: "product", targetId: id }, c);
    });
    await getStore("product-images").remove([old]).catch(() => {});
    revalidatePath(`/admin/products/${id}`);
    return { ok: true };
  });
}
