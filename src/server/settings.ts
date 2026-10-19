import "server-only";
import { cache } from "react";
import { appPool } from "@/server/db/pool";
import { log } from "@/server/logger";
import { getEnv } from "@/server/env";

export type BrandTheme = "trust_blue" | "deep_blue" | "teal";

export type SiteSettings = {
  companyName: string;
  legalName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  logoPath: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  brandTheme: BrandTheme;
  languages: string[];
  serialPrefix: string;
  labelSpec: Record<string, unknown>;
  riskThresholds: Record<string, number>;
  retention: Record<string, number>;
  /** False when the values below are defaults because the database could not be read. */
  fromDatabase: boolean;
};

const DEFAULTS: SiteSettings = {
  companyName: "Axiom Motive",
  legalName: null,
  supportEmail: null,
  supportPhone: null,
  websiteUrl: null,
  logoPath: null,
  privacyUrl: null,
  termsUrl: null,
  brandTheme: "trust_blue",
  languages: ["en"],
  serialPrefix: "AXM",
  labelSpec: {},
  riskThresholds: {},
  retention: {},
  fromDatabase: false,
};

type Row = {
  company_name: string; legal_name: string | null; support_email: string | null; support_phone: string | null;
  website_url: string | null; logo_path: string | null; privacy_url: string | null; terms_url: string | null;
  brand_theme: BrandTheme; languages: string[]; serial_prefix: string; label_spec: Record<string, unknown>;
  risk_thresholds: Record<string, number>; retention: Record<string, number>;
};

let memo: { at: number; value: SiteSettings } | null = null;
const TTL_MS = 15_000;

export function invalidateSettingsCache() {
  memo = null;
}

async function load(): Promise<SiteSettings> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  try {
    const { rows } = await appPool().query<Row>("select * from public.app_settings where id");
    const r = rows[0];
    if (!r) return DEFAULTS;
    const value: SiteSettings = {
      companyName: r.company_name, legalName: r.legal_name, supportEmail: r.support_email, supportPhone: r.support_phone,
      websiteUrl: r.website_url, logoPath: r.logo_path, privacyUrl: r.privacy_url, termsUrl: r.terms_url,
      brandTheme: r.brand_theme, languages: r.languages, serialPrefix: r.serial_prefix, labelSpec: r.label_spec,
      riskThresholds: r.risk_thresholds, retention: r.retention, fromDatabase: true,
    };
    memo = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Marketing/legal pages stay up with neutral defaults. Verification itself never
    // depends on this: it talks to the database directly and fails honestly.
    log.warn("settings.load_failed", { code: (err as { code?: string }).code });
    return DEFAULTS;
  }
}

/** Per-request memoised (React cache) + short process-level TTL. */
export const getSiteSettings = cache(load);

export function siteUrl(): string {
  return getEnv().PUBLIC_SITE_URL.replace(/\/+$/, "");
}
