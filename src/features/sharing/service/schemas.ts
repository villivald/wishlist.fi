import { z } from "zod";
import { emailSchema } from "@/features/auth/service/schemas";

export const listAccessSchema = z.enum(["HIDDEN", "PRIVATE", "PUBLIC"]);
const invitationAccess = {
  shareAccess: z.enum(["KEEP", "PRIVATE"]).default("KEEP"),
  expectedAccess: listAccessSchema.optional(),
};

export const invitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["MEMBER", "ADMIN"]),
  ...invitationAccess,
});

export const favoriteInvitationSchema = z.object({
  recipientId: z.string().min(1).max(100),
  role: z.enum(["MEMBER", "ADMIN"]),
  ...invitationAccess,
});

export const listAccessChangeSchema = z.object({
  access: listAccessSchema,
  expectedAccess: listAccessSchema.optional(),
  confirmedReservationIds: z.array(z.string().max(200)).max(10000).default([]),
});

export const roleSchema = z.enum(["MEMBER", "ADMIN"]);
export const visibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export const sharingPage = (input: unknown) => {
  const page = Number(input);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1;
};
