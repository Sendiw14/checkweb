import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/server/env";

const isProd = () => getEnv().NODE_ENV === "production";

/**
 * Per-request Supabase client bound to the caller's cookies. Session cookies are set
 * httpOnly (no browser-side Supabase client exists in this app), Secure in production,
 * SameSite=Lax. In Server Components setAll cannot write cookies; proxy.ts refreshes
 * the session for /admin requests instead, so ignoring that error is expected.
 */
export async function createSupabaseServerClient() {
  const env = getEnv();
  const store = await cookies();
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, { ...options, httpOnly: true, secure: isProd(), sameSite: "lax", path: "/" });
          }
        } catch {
          /* called from a Server Component */
        }
      },
    },
    auth: { flowType: "pkce" },
  });
}

/**
 * Service-role client: BYPASSES row level security and can administer users. Import it only
 * from code that has already authorised the actor. Never expose it to the browser.
 */
export function createSupabaseAdminClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
