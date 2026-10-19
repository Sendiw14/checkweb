import { getEnv } from "@/server/env";
import { getStore } from "@/server/storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Serves PUBLIC product images when the local filesystem store is in use (development).
 * In production images come straight from the public Supabase bucket and this route is a 404.
 * It can only ever read under products/ and never touches the private artifact bucket.
 */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...path]">) {
  if (getEnv().ARTIFACT_STORAGE !== "local") return new Response("Not found", { status: 404 });
  const { path } = await ctx.params;
  const key = path.join("/");
  const m = /^(?:products\/[0-9a-f-]{36}|brand)\/[A-Za-z0-9-]+\.(jpg|png|webp)$/.exec(key);
  if (!m) return new Response("Not found", { status: 404 });
  const bytes = await getStore("product-images").get(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": TYPES[m[1]!]!, "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
