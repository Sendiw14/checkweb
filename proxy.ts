import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs on every page request:
 *  - generates a per-request CSP nonce (all pages are rendered dynamically for this),
 *  - sets the security headers,
 *  - for /verify, forbids the Referer header and caching.
 * Authorisation is NOT decided here (proxy is only an optimistic gate); every
 * admin page, action and API route re-checks the session and role on the server.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== "production";
  const supabaseOrigin = (() => {
    try {
      return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).origin : "";
    } catch {
      return "";
    }
  })();

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind output is an external stylesheet; Motion and Radix set inline style attributes.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: http://localhost:* http://127.0.0.1:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  const path = request.nextUrl.pathname;
  if (path === "/verify" || path.startsWith("/verify/")) {
    // The QR fragment never reaches the server, but make sure nothing leaks onward or is stored.
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store, max-age=0");
  }
  if (path.startsWith("/admin") || path === "/login" || path === "/reset-password") {
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "same-origin");
  }
  return response;
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
