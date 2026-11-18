import {
  attachStagedImage,
  detachImage,
  stageImage,
} from "@/features/media/service/media";
import { imageSelection } from "@/features/media/types";
import { participantReservation } from "@/features/reservation/service/access";
import { manageableLists } from "@/features/wishlist/service/access";
import { lockManagedWishlist } from "@/features/wishlist/service/lists";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { readableWishes } from "./access";
import {
  wishSchema,
  wishSortSchema,
  wishTransitionSchema,
  wishViewSchema,
} from "./schemas";

export class WishError extends Error {}

const wishFields = {
  image: imageSelection,
  id: true,
  title: true,
  description: true,
  externalUrl: true,
  priceMinor: true,
  currency: true,
  priority: true,
  hidden: true,
  fulfilledAt: true,
} satisfies Prisma.WishSelect;

const reservationStatus = {
  _count: { select: { reservations: { where: { endedAt: null } } } },
} satisfies Prisma.WishSelect;

const orderings = {
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  oldest: [{ createdAt: "asc" }, { id: "asc" }],
  priority: [
    { priority: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
    { id: "desc" },
  ],
  title: [{ title: "asc" }, { id: "asc" }],
} satisfies Record<string, Prisma.WishOrderByWithRelationInput[]>;

export const readListWishes = async (
  listId: string,
  userId: string | null,
  options: {
    sort?: string;
    view?: string;
    page?: number;
    reserved?: boolean;
  } = {},
) => {
  const sort = wishSortSchema.parse(options.sort);
  const view = wishViewSchema.parse(options.view);
  const requestedPage = options.page ?? 1;
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1;

  const results = await prisma.wish.findMany({
    where: {
      wishlistId: listId,
      ...readableWishes(userId, true),
      ...(options.reserved
        ? { reservations: { some: { endedAt: null } } }
        : {}),
      fulfilledAt: view === "fulfilled" ? { not: null } : null,
    },
    select: {
      ...wishFields,
      ...reservationStatus,
      reservations: {
        where: participantReservation(userId ?? ""),
        select: { id: true },
        take: 1,
      },
    },
    orderBy: orderings[sort],
    skip: (page - 1) * 20,
    take: 21,
  });

  return {
    wishes: results.slice(0, 20).map(({ _count, reservations, ...wish }) => ({
      ...wish,
      isReserved: _count.reservations > 0,
      isReservedByYou: reservations.length > 0,
    })),
    hasNextPage: results.length > 20,
    page,
    sort,
    view,
  };
};

export const readWish = async (
  listId: string,
  wishId: string,
  userId: string | null,
  manage = false,
) => {
  if (
    ![listId, wishId].every((id) => wishlistIdSchema.safeParse(id).success) ||
    (manage && !userId)
  ) {
    return null;
  }

  const wish = await prisma.wish.findFirst({
    where: {
      id: wishId,
      wishlistId: listId,
      ...(manage && userId
        ? { wishlist: manageableLists(userId) }
        : readableWishes(userId, true)),
    },
    select: {
      ...wishFields,
      _count: {
        select: {
          reservations: { where: participantReservation(userId ?? "") },
        },
      },
      wishlist: {
        select: {
          id: true,
          title: true,
          publication: true,
          reservationsEnabled: true,
          memberships: {
            where: {
              userId: userId ?? "",
              role: "ADMIN",
              user: { emailVerified: true },
            },
            select: { role: true },
          },
        },
      },
      reservations: {
        where: { endedAt: null },
        select: { id: true, groupEnabled: true },
      },
    },
  });

  if (!wish) {
    return null;
  }

  const {
    wishlist: { memberships, publication, reservationsEnabled, ...wishlist },
    reservations,
    _count,
    ...details
  } = wish;

  const canManage = memberships.length > 0;
  const isReservedByYou = _count.reservations > 0;

  return {
    ...details,
    wishlist,
    canManage,
    isReserved: reservations.length > 0,
    isReservedByYou,
    canStartGroup:
      isReservedByYou && reservationsEnabled && publication === "PUBLISHED",
    isGroupReservation: isReservedByYou && !!reservations[0]?.groupEnabled,
    reservationId:
      canManage || isReservedByYou ? (reservations[0]?.id ?? null) : null,
    canReserve:
      publication === "PUBLISHED" &&
      reservationsEnabled &&
      !details.hidden &&
      !details.fulfilledAt &&
      reservations.length === 0,
  };
};

export const createWish = async (
  userId: string,
  listId: string,
  input: unknown,
  image?: { bytes: Buffer; alt: string },
) => {
  const data = wishSchema.parse(input);
  const imageId = image
    ? await stageImage(
        userId,
        { kind: "list", listId },
        image.alt.trim() || data.title,
        image.bytes,
      )
    : null;

  return prisma.$transaction(async (tx) => {
    await lockManagedWishlist(tx, listId, userId);

    const wish = await tx.wish.create({
      data: { ...data, wishlistId: listId, authorId: userId },
      select: { id: true },
    });
    if (imageId) {
      await attachStagedImage(
        tx,
        userId,
        { kind: "wish", listId, wishId: wish.id },
        imageId,
      );
    }
    return wish;
  });
};

const lockManagedWish = async (
  tx: Prisma.TransactionClient,
  userId: string,
  listId: string,
  wishId: string,
) => {
  wishlistIdSchema.parse(wishId);
  await lockManagedWishlist(tx, listId, userId);

  const wish = await tx.wish.findFirst({
    where: { id: wishId, wishlistId: listId },
    select: { id: true, fulfilledAt: true },
  });

  if (!wish) {
    throw new WishError(
      "This wish is unavailable or you do not have permission to change it.",
    );
  }

  return wish;
};

export const updateWish = async (
  userId: string,
  listId: string,
  wishId: string,
  input: unknown,
  image?: { bytes: Buffer; alt: string } | null,
) => {
  const data = wishSchema.parse(input);
  const target = { kind: "wish" as const, listId, wishId };
  const imageId = image
    ? await stageImage(
        userId,
        target,
        image.alt.trim() || data.title,
        image.bytes,
      )
    : null;

  await prisma.$transaction(async (tx) => {
    await lockManagedWish(tx, userId, listId, wishId);

    if (data.hidden) {
      await tx.reservation.updateMany({
        where: { wishId, endedAt: null },
        data: { endedAt: new Date() },
      });
    }

    await tx.wish.update({ where: { id: wishId }, data });
    if (imageId) await attachStagedImage(tx, userId, target, imageId);
    else if (image === null) await detachImage(tx, userId, target);
  });
};

export const transitionWish = async (
  userId: string,
  listId: string,
  wishId: string,
  value: unknown,
) => {
  const transition = wishTransitionSchema.parse(value);

  await prisma.$transaction(async (tx) => {
    const wish = await lockManagedWish(tx, userId, listId, wishId);

    if (transition === "hide" || transition === "fulfill") {
      await tx.reservation.updateMany({
        where: { wishId, endedAt: null },
        data: { endedAt: new Date() },
      });
    }

    const data =
      transition === "hide" || transition === "unhide"
        ? { hidden: transition === "hide" }
        : {
            fulfilledAt:
              transition === "fulfill"
                ? (wish.fulfilledAt ?? new Date())
                : null,
          };

    await tx.wish.update({ where: { id: wishId }, data });
  });
};

export const deleteWish = async (
  userId: string,
  listId: string,
  wishId: string,
) => {
  await prisma.$transaction(async (tx) => {
    await lockManagedWish(tx, userId, listId, wishId);
    await tx.wish.delete({ where: { id: wishId } });
  });
};
