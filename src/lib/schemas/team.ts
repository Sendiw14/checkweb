import { z } from "zod";
import { ROLES } from "@/server/domain/enums";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid work email address.")),
  displayName: z.string().trim().min(2, "Enter their name.").max(120),
  role: z.enum(ROLES, { error: "Choose a role." }),
});
export type InviteInput = z.input<typeof inviteSchema>;
