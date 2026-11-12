import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use at most 128 characters");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const usernameSchema = z
  .string()
  .trim()
  .min(2, "Use 2–40 letters, numbers, underscores, or hyphens.")
  .max(40, "Use 2–40 letters, numbers, underscores, or hyphens.")
  .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, or hyphens");

export const signUpSchema = newPasswordSchema.safeExtend({
  username: usernameSchema,
  email: emailSchema,
});
