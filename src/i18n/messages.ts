/**
 * Message catalogue. English is complete; Sinhala (si) and Tamil (ta) are
 * registered so layouts, fonts and routing are ready, but their catalogues are
 * intentionally empty: translations (above all recall and safety wording) must be
 * written or reviewed by fluent speakers and approved by the company, never
 * machine-generated. Missing keys fall back to English.
 */
export const LOCALES = ["en", "si", "ta"] as const;
export type Locale = (typeof LOCALES)[number];

export const en = {
  "nav.verify": "Verify a part",
  "nav.how": "How it works",
  "nav.faq": "FAQ",
  "nav.support": "Support",
  "nav.signIn": "Staff sign in",
  "verify.checking": "Checking this code",
  "verify.checkingHint": "Looking it up in {company}'s records…",
  "verify.manual.title": "Enter the code instead",
  "verify.manual.hint": "Use the 20-character code printed under the QR code, if the QR code is damaged or won't scan.",
  "verify.manual.label": "Verification code",
  "verify.manual.submit": "Check code",
  "verify.another": "Check another part",
  "verify.contact": "Contact support",
  "verify.report": "Tell us about this part",
  "verify.retry": "Try again",
  "verify.reference": "Reference",
  "verify.serial": "Serial number",
  "verify.partNumber": "Part number",
  "verify.product": "Product",
  "verify.firstChecked": "First checked",
  "verify.timesBefore": "Checked before",
} as const;

export type MessageKey = keyof typeof en;
const catalogues: Record<Locale, Partial<Record<MessageKey, string>>> = { en, si: {}, ta: {} };

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = catalogues[locale][key] ?? en[key];
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : raw;
}
