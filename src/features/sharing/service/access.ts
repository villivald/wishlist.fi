import { AuthError, lockUser } from "@/features/auth/service/security";
import { lockWishlist } from "@/features/wishlist/service/lock";
import type { Prisma } from "@/generated/prisma/client";

export class SharingError extends Error {}

export const lockSharing = async (
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  listId: string,
) => {
  // Coordinate cross-account membership/ownership writes with account deletion.
  // Always acquire this before user and list locks, matching deleteAccount.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(8108, 1)::text`;
  await lockUser(tx, userId);
  const user = await tx.user.findFirst({
    where: {
      id: userId,
      emailVerified: true,
      sessions: { some: { id: sessionId, expiresAt: { gt: new Date() } } },
    },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new AuthError("Your session expired. Please sign in again.");
  }
  await lockWishlist(tx, listId);
  const list = await tx.wishlist.findFirst({
    where: { id: listId, archivedAt: null },
    select: {
      id: true,
      ownerId: true,
      visibility: true,
      memberships: { where: { userId }, select: { role: true } },
    },
  });
  if (!list) {
    throw new SharingError("This list is unavailable.");
  }
  return { user, list, role: list.memberships[0]?.role };
};

export const requireAdmin = (role: string | undefined) => {
  if (role !== "ADMIN") {
    throw new SharingError("You do not have permission to manage this list.");
  }
};
