/** Only same-site staff paths are valid post-login destinations (prevents open redirects). */
export function safeNext(raw: unknown, fallback = "/admin/dashboard"): string {
  if (typeof raw !== "string" || raw.length > 300) return fallback;
  if (!/^\/admin(?:[/?#]|$)/.test(raw)) return fallback; // "/admin", "/admin/...", never "/adminx"
  if (raw.includes("\\") || /[\r\n\t]/.test(raw) || raw.includes("//") || raw.includes("..")) return fallback;
  return raw;
}
