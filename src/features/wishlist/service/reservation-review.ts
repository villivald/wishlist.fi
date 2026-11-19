import type { Prisma } from "@/generated/prisma/client";
import { ReservationReviewRequired } from "./errors";

export { ReservationReviewRequired, type ReservedWish } from "./errors";

// Call only while holding the parent list lock, which also serializes reservations.
export const endListReservations = async (
  tx: Prisma.TransactionClient,
  listId: string,
  confirmedReservationIds: readonly string[],
) => {
  const reservations = await tx.reservation.findMany({
    where: { wish: { wishlistId: listId }, endedAt: null },
    select: { id: true, wish: { select: { title: true } } },
    orderBy: { id: "asc" },
  });
  const confirmed = new Set(confirmedReservationIds);
  if (reservations.some(({ id }) => !confirmed.has(id)))
    throw new ReservationReviewRequired(
      reservations.map(({ id, wish }) => ({ id, wishTitle: wish.title })),
    );
  const ended = await tx.reservation.updateMany({
    where: { wish: { wishlistId: listId }, endedAt: null },
    data: { endedAt: new Date() },
  });
  return ended.count;
};
