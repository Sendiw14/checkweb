import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { createSupabaseAdminClient } from "@/server/auth/supabase";
import { getEnv } from "@/server/env";
import { assertSafeStoragePath } from "@/server/storage/paths";

/**
 * Two buckets, two very different rules:
 *   label-artifacts  PRIVATE. Print PDFs contain live verification credentials. Only reachable
 *                    through authorised, audited, short-lived downloads.
 *   product-images   PUBLIC. Product photos only.
 */
export type BucketName = "label-artifacts" | "product-images";

export interface ObjectStore {
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  remove(paths: string[]): Promise<void>;
  /** Short-lived signed URL (Supabase). Null when the store cannot sign (local dev): stream instead. */
  signedUrl(path: string, ttlSeconds: number, downloadName?: string): Promise<string | null>;
}

class LocalStore implements ObjectStore {
  constructor(private root: string) {}
  private file(path: string) {
    const full = resolve(this.root, assertSafeStoragePath(path));
    if (!full.startsWith(resolve(this.root) + sep)) throw new Error("unsafe storage path");
    return full;
  }
  async put(path: string, bytes: Uint8Array) {
    const f = this.file(path);
    await mkdir(dirname(f), { recursive: true });
    await writeFile(f, bytes, { mode: 0o600 });
  }
  async get(path: string) {
    try { return await readFile(this.file(path)); } catch { return null; }
  }
  async remove(paths: string[]) {
    await Promise.all(paths.map((p) => rm(this.file(p), { force: true })));
  }
  async signedUrl() { return null; }
}

class SupabaseStore implements ObjectStore {
  constructor(private bucket: BucketName) {}
  private api() { return createSupabaseAdminClient().storage.from(this.bucket); }
  async put(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.api().upload(assertSafeStoragePath(path), bytes, { contentType, upsert: true, cacheControl: "private, max-age=0" });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
  }
  async get(path: string) {
    const { data, error } = await this.api().download(assertSafeStoragePath(path));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(paths: string[]) {
    if (!paths.length) return;
    const { error } = await this.api().remove(paths.map(assertSafeStoragePath));
    if (error) throw new Error(`storage delete failed: ${error.message}`);
  }
  async signedUrl(path: string, ttlSeconds: number, downloadName?: string) {
    const { data, error } = await this.api().createSignedUrl(assertSafeStoragePath(path), ttlSeconds, downloadName ? { download: downloadName } : undefined);
    if (error || !data) throw new Error("could not sign url");
    return data.signedUrl;
  }
}

/** For tests and scripts that need an isolated local store. */
export function createLocalStore(root: string): ObjectStore {
  return new LocalStore(root);
}

export function getStore(bucket: BucketName): ObjectStore {
  const env = getEnv();
  return env.ARTIFACT_STORAGE === "local" ? new LocalStore(resolve(process.cwd(), env.LOCAL_STORAGE_DIR, bucket)) : new SupabaseStore(bucket);
}
