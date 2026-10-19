import { z } from "zod";

const upper = (s: string) => s.trim().toUpperCase();

export const productSchema = z.object({
  sku: z.string().transform(upper).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._-]{0,38}[A-Z0-9]$/, "SKU: 2–40 characters; letters, digits, dot, dash or underscore, starting and ending with a letter or digit.")),
  partNumber: z.string().transform(upper).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]{0,38}[A-Z0-9]$/, "Part number: 2–40 characters; letters, digits, dot, dash, underscore or slash.")),
  name: z.string().trim().min(2, "Give the product a name.").max(160, "Keep the name under 160 characters."),
  brand: z.string().trim().max(80).optional().transform((v) => v || undefined),
  category: z.string().trim().max(80).optional().transform((v) => v || undefined),
  description: z.string().trim().max(4000, "Keep the description under 4,000 characters.").optional().transform((v) => v || undefined),
});
export type ProductInput = z.input<typeof productSchema>;
export type ProductValues = z.output<typeof productSchema>;
