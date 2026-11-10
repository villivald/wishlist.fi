import { cache } from "react";
import { imageSelection } from "@/features/media/types";
import { sharingPage } from "@/features/sharing/service/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/utils/crypto";
import { guestTokenSchema } from "./schemas";

const activeLink = (token: unknown): Prisma.GuestLinkWhereInput => {
  const parsed = guestTokenSchema.safeParse(token);
  return {
    tokenHash: parsed.success ? hashToken(parsed.data) : "invalid",
    revokedAt: null,
    expiresAt: { gt: new Date() },
  };
};

// Guest access never combines with account/admin permissions or reveals reservations.
export const guestListAccess = (
  listId: string,
  token: unknown,
): Prisma.WishlistWhereInput => ({
  id: listId,
  publication: "PUBLISHED",
  archivedAt: null,
  guestLinks: { some: activeLink(token) },
});

const guestWishAccess = (
  listId: string,
  token: unknown,
): Prisma.WishWhereInput => ({
  wishlist: guestListAccess(listId, token),
  hidden: false,
  fulfilledAt: null,
  reservations: { none: { endedAt: null } },
});

const wishFields = {
  id: true,
  title: true,
  description: true,
  externalUrl: true,
  priceMinor: true,
  currency: true,
  priority: true,
  image: imageSelection,
} satisfies Prisma.WishSelect;

export const resolveGuestLink = cache((token: unknown) =>
  prisma.guestLink.findFirst({
    where: {
      ...activeLink(token),
      wishlist: { archivedAt: null, publication: "PUBLISHED" },
    },
    select: { wishlistId: true, expiresAt: true },
  }),
);

export const readGuestList = (listId: string, token: unknown) =>
  prisma.wishlist.findFirst({
    where: guestListAccess(listId, token),
    select: {
      id: true,
      title: true,
      theme: true,
      description: true,
      image: imageSelection,
    },
  });

export const readGuestWishes = async (
  listId: string,
  token: unknown,
  input: unknown = 1,
) => {
  const page = sharingPage(input);
  const wishes = await prisma.wish.findMany({
    where: guestWishAccess(listId, token),
    select: wishFields,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 20,
    take: 21,
  });
  return { wishes: wishes.slice(0, 20), page, hasNextPage: wishes.length > 20 };
};

export const readGuestWish = (listId: string, wishId: string, token: unknown) =>
  prisma.wish.findFirst({
    where: { id: wishId, ...guestWishAccess(listId, token) },
    select: wishFields,
  });

export const readGuestImage = (listId: string, id: string, token: unknown) =>
  prisma.media.findFirst({
    where: {
      id,
      state: "READY",
      OR: [
        { wishlist: guestListAccess(listId, token) },
        { wish: guestWishAccess(listId, token) },
      ],
    },
    select: { id: true, pathname: true, provider: true, variantWidths: true },
  });
