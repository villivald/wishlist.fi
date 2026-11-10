import { lockUser } from "@/features/auth/service/security";
import { imageSelection } from "@/features/media/types";
import { requirePremium } from "@/features/premium/service/entitlements";
import { visibilitySchema } from "@/features/sharing/service/schemas";
import { wishPreviewSelection } from "@/features/wish/service/preview";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { manageableLists, readableLists } from "./access";
import { lockWishlist } from "./lock";
import { publicationSchema, wishlistIdSchema, wishlistSchema } from "./schemas";
import { readWishCounts } from "./wish-counts";

export class WishlistError extends Error {}

export type ReservedWish = { id: string; wishTitle: string };
export class ReservationReviewRequired extends WishlistError {
  constructor(readonly reservations: ReservedWish[]) {
    super("Review the reserved wishes before hiding this list.");
  }
}

const listFields = {
  image: imageSelection,
  id: true,
  title: true,
  theme: true,
  description: true,
  publication: true,
  visibility: true,
  reservationsEnabled: true,
} satisfies Prisma.WishlistSelect;

export const readWishlist = async (id: string, userId: string | null) => {
  if (!wishlistIdSchema.safeParse(id).success) {
    return null;
  }

  const list = await prisma.wishlist.findFirst({
    where: { id, ...readableLists(userId) },
    select: {
      ...listFields,
      ownerId: true,
      owner: { select: { username: true } },
      memberships: {
        where: {
          userId: userId ?? "",
          role: "ADMIN",
          user: { emailVerified: true },
        },
        select: { role: true },
      },
    },
  });

  if (!list) {
    return null;
  }

  const { memberships, ownerId, ...details } = list;
  const canManage = memberships.length > 0;

  return { ...details, canManage, ...(canManage ? { ownerId } : {}) };
};

export const readManagedWishlist = (id: string, userId: string) => {
  if (!wishlistIdSchema.safeParse(id).success) {
    return Promise.resolve(null);
  }

  return prisma.wishlist.findFirst({
    where: { id, ...manageableLists(userId) },
    select: { ...listFields, ownerId: true },
  });
};

export const readMyWishlists = async (
  userId: string,
  page = 1,
  includeShared = false,
) => {
  const pageSize = 20;
  const currentPage =
    Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1;
  const results = await prisma.wishlist.findMany({
    where: {
      archivedAt: null,
      ...(includeShared ? {} : { ownerId: userId }),
      memberships: {
        some: {
          userId,
          user: { emailVerified: true },
          ...(includeShared ? {} : { role: "ADMIN" }),
        },
      },
    },
    select: {
      ...listFields,
      ownerId: true,
      owner: { select: { username: true } },
      wishes: wishPreviewSelection,
      memberships: { where: { userId }, select: { id: true, role: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize + 1,
  });
  const lists = results.slice(0, pageSize);
  const counts = await readWishCounts(
    userId,
    lists.map(({ id }) => id),
  );

  return {
    lists: lists.map(({ wishes, memberships, ownerId, ...list }) => {
      const membership = memberships[0];
      const canManage = membership?.role === "ADMIN";
      const accessible = canManage || list.publication === "PUBLISHED";
      return {
        ...list,
        title: accessible ? list.title : null,
        image: accessible ? list.image : null,
        description: accessible ? list.description : null,
        owner: accessible ? list.owner : null,
        theme: accessible ? list.theme : "classic",
        isOwner: ownerId === userId,
        canManage,
        membership,
        ...(counts.get(list.id) ?? {
          availableWishCount: 0,
          reservedWishCount: 0,
        }),
        previewImages: accessible
          ? wishes.flatMap(({ image }) => (image ? [image] : []))
          : [],
      };
    }),
    hasNextPage: results.length > pageSize,
    page: currentPage,
  };
};

export const createWishlist = async (userId: string, input: unknown) => {
  const data = wishlistSchema.parse(input);
  const visibility = visibilitySchema
    .default("PUBLIC")
    .parse(
      input && typeof input === "object" && "visibility" in input
        ? input.visibility
        : undefined,
    );

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findFirst({
      where: { id: userId, emailVerified: true },
      select: { id: true },
    });

    if (!user) {
      throw new WishlistError(
        "Sign in with a verified account to create a list.",
      );
    }

    if (visibility === "PRIVATE" || (data.theme && data.theme !== "classic"))
      await requirePremium(user.id, tx);

    return tx.wishlist.create({
      data: {
        ...data,
        description: data.description || null,
        ownerId: user.id,
        publication: "PUBLISHED",
        visibility,
        memberships: { create: { userId: user.id, role: "ADMIN" } },
      },
      select: { id: true },
    });
  });
};

export const lockManagedWishlist = async (
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
) => {
  await lockUser(tx, userId);
  await lockWishlist(tx, id);

  const list = await tx.wishlist.findFirst({
    where: { id, ...manageableLists(userId) },
    select: { id: true },
  });

  if (!list) {
    throw new WishlistError(
      "This list is unavailable or you do not have permission to change it.",
    );
  }
};

export const updateWishlist = async (
  userId: string,
  id: string,
  input: unknown,
) => {
  const data = wishlistSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    await lockManagedWishlist(tx, id, userId);
    const current = await tx.wishlist.findUniqueOrThrow({
      where: { id },
      select: { theme: true, ownerId: true },
    });
    if (
      data.theme &&
      data.theme !== current.theme &&
      data.theme !== "classic"
    ) {
      await requirePremium(current.ownerId!, tx);
    }
    await tx.wishlist.update({
      where: { id },
      data: { ...data, description: data.description || null },
    });
  });
};

export const setWishlistPublication = async (
  userId: string,
  id: string,
  value: unknown,
  confirmedReservationIds: readonly string[] = [],
) => {
  const publication = publicationSchema.parse(value);

  return prisma.$transaction(async (tx) => {
    await lockManagedWishlist(tx, id, userId);

    let endedReservations = 0;
    if (publication === "DRAFT") {
      // The same lock serializes new reservations, so a newly reserved wish
      // cannot slip through between review and the destructive update.
      const reservations = await tx.reservation.findMany({
        where: { wish: { wishlistId: id }, endedAt: null },
        select: { id: true, wish: { select: { title: true } } },
        orderBy: { id: "asc" },
      });
      const confirmed = new Set(confirmedReservationIds);
      if (reservations.some(({ id }) => !confirmed.has(id)))
        throw new ReservationReviewRequired(
          reservations.map(({ id, wish }) => ({ id, wishTitle: wish.title })),
        );
      const ended = await tx.reservation.updateMany({
        where: { wish: { wishlistId: id }, endedAt: null },
        data: { endedAt: new Date() },
      });
      endedReservations = ended.count;
    }

    await tx.wishlist.update({ where: { id }, data: { publication } });
    return { endedReservations };
  });
};

export const deleteWishlist = async (userId: string, id: string) => {
  await prisma.$transaction(async (tx) => {
    await lockManagedWishlist(tx, id, userId);

    // Wishes, memberships, and reservations cascade with their deleted list.
    await tx.wishlist.delete({ where: { id } });
  });
};
