import { requirePremium } from "@/features/premium/service/entitlements";
import { listAccess } from "@/features/wishlist/list-access";
import { endListReservations } from "@/features/wishlist/service/reservation-review";
import { prisma } from "@/lib/prisma";
import { lockSharing, requireAdmin, SharingError } from "./access";
import { listAccessChangeSchema } from "./schemas";

export const setListAccess = async (
  userId: string,
  sessionId: string,
  listId: string,
  input: unknown,
) => {
  const data = listAccessChangeSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { list, role } = await lockSharing(tx, userId, sessionId, listId);
    requireAdmin(role);
    if (data.expectedAccess && data.expectedAccess !== listAccess(list))
      throw new SharingError(
        "List access changed. Refresh this page and review it before continuing.",
      );
    if (data.access === "PRIVATE" && list.visibility !== "PRIVATE")
      await requirePremium(list.ownerId!, tx);
    const endedReservations =
      data.access === "HIDDEN"
        ? await endListReservations(tx, listId, data.confirmedReservationIds)
        : 0;
    // Keep the saved audience when hiding. Visible choices update both fields atomically.
    await tx.wishlist.update({
      where: { id: listId },
      data:
        data.access === "HIDDEN"
          ? { publication: "DRAFT" }
          : { publication: "PUBLISHED", visibility: data.access },
    });
    return { endedReservations };
  });
};
