import "server-only";

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type Page = { page: number; pageSize: number; offset: number };

export function pageOf(raw: { page?: string | string[]; pageSize?: string | string[] }, defaultSize = 25): Page {
  const n = (v: string | string[] | undefined, d: number) => {
    const x = Number(Array.isArray(v) ? v[0] : v);
    return Number.isFinite(x) && x >= 1 ? Math.floor(x) : d;
  };
  const pageSize = Math.min(n(raw.pageSize, defaultSize), 100);
  const page = Math.min(n(raw.page, 1), 10_000);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** First value of a query parameter (Next gives string | string[] | undefined). */
export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
