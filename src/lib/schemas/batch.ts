import { z } from "zod";

export const MAX_BATCH = 1_000_000;

export const batchSchema = z.object({
  productId: z.string().uuid("Choose a product."),
  batchCode: z.string().transform((s) => s.trim().toUpperCase()).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,38}[A-Z0-9]$/, "Batch code: 2–40 characters; letters, digits, dot, dash or underscore.")),
  manufacturingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the manufacturing date.").refine((d) => !Number.isNaN(Date.parse(d)), "That date isn't valid."),
  expectedQuantity: z.coerce.number({ error: "Enter a number." }).int("Whole units only.").min(1, "At least 1 unit.").max(MAX_BATCH, `At most ${MAX_BATCH.toLocaleString("en-US")} units per batch.`),
  registerNow: z.coerce.boolean().default(false),
  notes: z.string().trim().max(4000).optional().transform((v) => v || undefined),
});
export type BatchInput = z.input<typeof batchSchema>;
export type BatchValues = z.output<typeof batchSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3, "Give a short reason (at least 3 characters).").max(500, "Keep it under 500 characters.") });
export const quantitySchema = z.object({ quantity: z.coerce.number({ error: "Enter a number." }).int("Whole units only.").min(1, "At least 1.").max(100_000, "At most 100,000 at a time.") });
