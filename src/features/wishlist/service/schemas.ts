import { z } from "zod";
import { listThemeIds } from "@/features/premium/themes";
import { visibilitySchema } from "@/features/sharing/service/schemas";

export const wishlistIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const wishlistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title")
    .max(200, "Use at most 200 characters"),
  description: z.string().trim().max(2000, "Use at most 2,000 characters"),
  reservationsEnabled: z.boolean().default(true),
  theme: z.enum(listThemeIds).optional(),
});

export const publicationSchema = z.enum(["DRAFT", "PUBLISHED"]);

export const createWishlistSchema = wishlistSchema.extend({
  visibility: visibilitySchema.default("PUBLIC"),
  publication: publicationSchema.default("PUBLISHED"),
});
