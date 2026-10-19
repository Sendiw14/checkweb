import { z } from "zod";
import { labelSpecSchema } from "@/server/labels/spec";

export const createJobSchema = z.object({
  batchId: z.string().uuid("Choose a batch."),
  quantity: z.coerce.number({ error: "Enter a number." }).int("Whole labels only.").min(1, "At least 1 label.").max(100_000, "At most 100,000 labels per job."),
  idempotencyKey: z.string().uuid(),
  spec: labelSpecSchema,
});
export type CreateJobInput = z.input<typeof createJobSchema>;
