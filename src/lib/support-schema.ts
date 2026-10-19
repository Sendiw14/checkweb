import { z } from "zod";
import { SUPPORT_KINDS } from "@/server/domain/enums";

export const SUPPORT_KIND_LABELS: Record<(typeof SUPPORT_KINDS)[number], string> = {
  question: "A question about a part or the check",
  concern: "A concern about a part I have",
  suspected_counterfeit: "I think a part may not be genuine",
  recall_enquiry: "I have a question about a recall",
};

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

/** Shared by the browser form and the server action; the server re-validates everything. */
export const supportSchema = z
  .object({
    kind: z.enum(SUPPORT_KINDS),
    subject: z.string().trim().min(3, "Give your message a short title.").max(160, "Keep the title under 160 characters."),
    message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000, "Please keep your message under 4,000 characters."),
    name: optionalText(120),
    email: z.string().trim().max(254).optional().transform((v) => (v ? v : undefined)).pipe(z.email("That email address doesn't look right.").optional()),
    phone: optionalText(40),
    serial: optionalText(60),
    ref: optionalText(16),
    consent: z.literal(true, { error: "Please confirm so we can use your details to reply." }),
    // Honeypot: real people never see or fill this field.
    website: z.string().max(0).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Give us an email address or a phone number so we can reply.", path: ["email"] });

export type SupportInput = z.input<typeof supportSchema>;
export type SupportValues = z.output<typeof supportSchema>;

export type SupportResult =
  | { ok: true; reference: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>>; retryAfterSeconds?: number };
