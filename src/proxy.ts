import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Runs on page requests:
 *  - generates a per-request CSP nonce (every page is dynamically rendered for this),
 *  - sets security headers,
 *  - refreshes the Supabase session for staff routes (Server Components cannot write cookies),
 *  - optimistically bounces anonymous visitors away from /admin.
 *
 * This is NOT the authorisation layer. Every admin page, server action and route handler
 * re-validates the session and the caller's role on the server.
 */
const isProd = process.env.NODE_ENV === "production";

function buildCsp(nonce: string) {
  const supabaseOrigin = (() => {
    try {
      return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
    } catch {
      return "";
    }
  })();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    // Tailwind output is an external stylesheet; Radix and Motion set inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
    "font-src 'self'",
    `connect-src 'self'${isProd ? "" : " ws: http://localhost:* http://127.0.0.1:*"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function applyHeaders(response: NextResponse, csp: string, path: string) {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (isProd) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (path === "/verify" || path.startsWith("/verify/")) {
    // The QR fragment never reaches the server, but nothing may leak onward or be stored.
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }
  if (path.startsWith("/admin") || path.startsWith("/login") || path.startsWith("/reset-password") || path.startsWith("/auth")) {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "same-origin");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const path = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const staffArea = path.startsWith("/admin") || path.startsWith("/login") || path.startsWith("/reset-password") || path.startsWith("/auth");
  if (staffArea && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, { ...options, httpOnly: true, secure: isProd, sameSite: "lax", path: "/" });
          }
        },
      },
      auth: { flowType: "pkce" },
    });
    // Also rotates an expired access token using the refresh token.
    const { data } = await supabase.auth.getUser();
    if (!data.user && path.startsWith("/admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
      return applyHeaders(NextResponse.redirect(url), csp, "/login");
    }
  }
  return applyHeaders(response, csp, path);
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|media).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
