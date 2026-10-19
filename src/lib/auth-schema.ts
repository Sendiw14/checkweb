import { z } from "zod";

export const PASSWORD_MIN = 12;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter the email address you use for work.")),
  password: z.string().min(1, "Enter your password.").max(256),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const resetRequestSchema = z.object({ email: loginSchema.shape.email });

export const newPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters. A few random words make a strong, memorable password.`).max(128, "Keep it under 128 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ["confirm"] });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

export const mfaCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.") });
