import { z } from "zod";

const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const optUrl = (allowPath: boolean) => z.string().trim().max(300).optional().transform((v) => v || undefined).refine(
  (v) => !v || /^https:\/\/[^\s]+$/i.test(v) || (allowPath && /^\/[A-Za-z0-9/_.-]*$/.test(v)),
  allowPath ? "Use a full https:// address or a path such as /privacy." : "Use a full https:// address.",
);
const int = (label: string, min: number, max: number) => z.coerce.number({ error: `${label}: enter a number.` }).int(`${label}: whole numbers only.`).min(min, `${label}: at least ${min}.`).max(max, `${label}: at most ${max}.`);

export const BRAND_THEMES = ["trust_blue", "deep_blue", "teal"] as const;

export const companySchema = z.object({
  companyName: z.string().trim().min(2, "Enter the company name.").max(80),
  legalName: optText(160),
  supportEmail: z.string().trim().max(254).optional().transform((v) => v || undefined).pipe(z.email("That email address doesn't look right.").optional()),
  supportPhone: optText(40),
  websiteUrl: optUrl(false),
  privacyUrl: optUrl(true),
  termsUrl: optUrl(true),
  brandTheme: z.enum(BRAND_THEMES),
  serialPrefix: z.string().transform((s) => s.trim().toUpperCase()).pipe(z.string().regex(/^[A-Z0-9]{2,6}$/, "2–6 capital letters or digits.")),
});
export type CompanyInput = z.input<typeof companySchema>;

export const riskSchema = z.object({
  rapidWindowMinutes: int("Rapid window", 1, 1440),
  rapidScans: int("Rapid scans", 2, 1000),
  networkWindowHours: int("Network window", 1, 168),
  distinctNetworks: int("Distinct networks", 2, 50),
  distinctCountries: int("Distinct countries", 2, 20),
  lifetimeScans: int("Lifetime scans", 5, 100000),
  revokedScans24h: int("Revoked scans", 2, 1000),
  suspiciousScore: int("Score threshold", 1, 10),
});
export type RiskInput = z.input<typeof riskSchema>;

export const retentionSchema = z.object({
  verificationNetworkDays: int("Network data", 7, 3650),
  supportCaseDays: int("Support cases", 30, 3650),
  labelArtifactDays: int("Label files", 1, 90),
});
export type RetentionInput = z.input<typeof retentionSchema>;
