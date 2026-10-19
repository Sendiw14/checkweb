import "server-only";
import { getEnv } from "@/server/env";

/** Public URL of a product image. Only the public `product-images` bucket is ever referenced. */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const env = getEnv();
  if (env.ARTIFACT_STORAGE === "local") return `/media/${path}`;
  return `${env.SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/product-images/${path}`;
}
