import { consumeRateLimit, lockUser } from "@/features/auth/service/security";
import { imageSelection } from "@/features/media/types";
import { readableLists } from "@/features/wishlist/service/access";
import { lockManagedWishlist } from "@/features/wishlist/service/lists";
import { lockWishlist } from "@/features/wishlist/service/lock";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";
import { Prisma } from "@/generated/prisma/client";
import {
  backgroundEvents,
  publishBackgroundEvents,
} from "@/lib/background-events";
import { prisma } from "@/lib/prisma";
import { maxPage, pageSize, readPageCount } from "@/utils/pagination";
import { participantReservation } from "./access";
import { queueWishReservedEmail } from "./owner-emails";

export class ReservationError extends Error {}

const unavailable =
  "This reservation is unavailable or you do not have permission to change it.";

export const verifyActor = async (
  tx: Prisma.TransactionClient,
  userId: string,
) => {
  await lockUser(tx, userId);
  const user = await tx.user.findFirst({
    where: { id: userId, emailVerified: true },
    select: { id: true },
  });

  if (!user) {
    throw new ReservationError(
      "Sign in with a verified account to manage reservations.",
    );
  }
};

const limitChanges = (userId: string) =>
  consumeRateLimit("reservation-change", userId, 60, 10 * 60 * 1000);

export const reserveWish = async (
  userId: string,
  listId: string,
  wishId: string,
  groupEnabled = false,
) => {
  wishlistIdSchema.parse(listId);
  wishlistIdSchema.parse(wishId);
  await limitChanges(userId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Queueing mail for the owner shares the cross-account deletion gate.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(8108, 1)::text`;
      await verifyActor(tx, userId);
      await lockWishlist(tx, listId);

      const wish = await tx.wish.findFirst({
        where: {
          id: wishId,
          wishlistId: listId,
          hidden: false,
          fulfilledAt: null,
          wishlist: {
            ...readableLists(userId),
            publication: "PUBLISHED",
            reservationsEnabled: true,
          },
          reservations: { none: { endedAt: null } },
        },
        select: { id: true },
      });

      if (!wish) {
        throw new ReservationError(
          "This wish can no longer be reserved. It may be unavailable, already reserved, or have reservations disabled.",
        );
      }

      const reservation = await tx.reservation.create({
        data: { userId, wishId: wish.id, groupEnabled },
        select: { id: true },
      });
      const emailId = await queueWishReservedEmail(tx, {
        ...reservation,
        wishId: wish.id,
        userId,
      });
      return { id: reservation.id, emailId };
    });
    await publishBackgroundEvents(backgroundEvents.accountEmail, [
      result.emailId,
    ]);
    return { id: result.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2025", "P2034"].includes(error.code)
    ) {
      throw new ReservationError(
        "This wish could not be reserved. Refresh the page and try again.",
      );
    }
    throw error;
  }
};

export const cancelReservation = async (
  userId: string,
  listId: string,
  wishId: string,
  reservationId: string,
) => {
  [listId, wishId, reservationId].forEach((id) => wishlistIdSchema.parse(id));
  await limitChanges(userId);

  await prisma.$transaction(async (tx) => {
    await verifyActor(tx, userId);
    await lockWishlist(tx, listId);
    const reservation = await tx.reservation.findFirst({
      where: {
        id: reservationId,
        userId,
        wishId,
        wish: { wishlistId: listId },
      },
      select: { id: true },
    });

    if (!reservation) {
      throw new ReservationError(unavailable);
    }

    // Replaying an old cancellation never affects a later reservation.
    await tx.reservation.updateMany({
      where: { id: reservation.id, endedAt: null },
      data: { endedAt: new Date() },
    });
  });
};

export const revokeReservation = async (
  userId: string,
  listId: string,
  wishId: string,
  reservationId: string,
) => {
  [listId, wishId, reservationId].forEach((id) => wishlistIdSchema.parse(id));
  await limitChanges(userId);

  await prisma.$transaction(async (tx) => {
    await verifyActor(tx, userId);
    await lockManagedWishlist(tx, listId, userId);
    const result = await tx.reservation.updateMany({
      where: {
        id: reservationId,
        wishId,
        endedAt: null,
        wish: { wishlistId: listId },
      },
      data: { endedAt: new Date() },
    });

    if (!result.count) {
      throw new ReservationError(unavailable);
    }
  });
};

export const readMyReservations = async (userId: string, requestedPage = 1) => {
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, maxPage)
      : 1;
  const where = {
    ...participantReservation(userId),
    wish: {
      hidden: false,
      fulfilledAt: null,
      wishlist: { ...readableLists(userId), publication: "PUBLISHED" },
    },
  } satisfies Prisma.ReservationWhereInput;
  const results = await prisma.reservation.findMany({
    where,
    select: {
      id: true,
      groupEnabled: true,
      wish: {
        select: {
          id: true,
          title: true,
          priceMinor: true,
          currency: true,
          priority: true,
          image: imageSelection,
          wishlist: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  });

  return {
    reservations: results.slice(0, pageSize),
    page,
    totalPages: await readPageCount(page, results.length, maxPage, (take) =>
      prisma.reservation.count({ where, take }),
    ),
    hasNextPage: results.length > pageSize && page < maxPage,
  };
};
