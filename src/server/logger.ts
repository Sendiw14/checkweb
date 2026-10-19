import "server-only";

/**
 * Structured, redacting logger. Application code must log through this module
 * (ESLint forbids console.*) so credentials cannot reach log sinks by accident.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|credential|hash|jwt|bearer/i;
const LONG_OPAQUE = /[A-Za-z0-9_-]{40,}/g; // QR tokens are 43 base64url chars
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const DSN = /\b(postgres(?:ql)?|https?):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi;
const TOKEN_IN_URL_FRAGMENT = /#[A-Za-z0-9_-]{20,}/g;

export function redactString(s: string): string {
  return s
    .replace(DSN, "[redacted-dsn]")
    .replace(JWT, "[redacted-jwt]")
    .replace(BEARER, "$1 [redacted]")
    .replace(TOKEN_IN_URL_FRAGMENT, "#[redacted]")
    .replace(LONG_OPAQUE, "[redacted-token]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return { name: value.name, message: redactString(value.message), code: (value as { code?: unknown }).code };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (Buffer.isBuffer(value)) return "[binary]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(typeof value);
}

type Level = "debug" | "info" | "warn" | "error";
const sink: { write: (line: string) => void } = {
  write: (line) => {
    process.stdout.write(line + "\n");
  },
};

/** Test hook. */
export function setLogSink(fn: (line: string) => void) {
  sink.write = fn;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(fields ?? {}) as object) });
  sink.write(line);
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
