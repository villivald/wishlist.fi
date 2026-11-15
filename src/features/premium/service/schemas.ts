import { z } from "zod";

export const promoInputSchema = z
  .string()
  .max(96)
  .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
  .pipe(z.string().regex(/^(?:WL[A-Z2-7]{32}|(?!WL)[A-Z][A-Z0-9]{5,31})$/));

export const promoIssueSchema = z.object({
  label: z.string().trim().min(1).max(80),
  code: promoInputSchema.optional(),
  durationDays: z.number().int().min(1).max(365),
  maxRedemptions: z.number().int().min(1).max(10000),
  validForDays: z.number().int().min(1).max(365),
});
