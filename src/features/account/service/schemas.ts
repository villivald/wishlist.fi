import { z } from "zod";
import { usernameSchema } from "@/features/auth/service/schemas";

export const profileSchema = z.object({
  username: usernameSchema.optional(),
  showPremiumBadge: z.boolean().optional(),
  name: z.string().trim().max(80, "Use at most 80 characters"),
  description: z.string().trim().max(1000, "Use at most 1,000 characters"),
});

export const deleteAccountSchema = z.object({
  password: z
    .string()
    .min(1, "Enter your current password")
    .max(128)
    .optional(),
  confirmation: z.literal("DELETE", { error: "Type DELETE to confirm" }),
  impactToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "Refresh the deletion summary"),
});
