import {
  AuthError,
  consumeRateLimit,
  lockUser,
} from "@/features/auth/service/security";
import { detachBilling } from "@/features/billing/service/accounts";
import { syncBillingAccount } from "@/features/billing/service/sync";
import { verifyPasswordHash } from "@/features/password/utils/hash-and-verify";
import { requirePremium } from "@/features/premium/service/entitlements";
import { lockWishlist } from "@/features/wishlist/service/lock";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/utils/crypto";
import { deleteAccountSchema, profileSchema } from "./schemas";

const currentAccount = async (
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
) => {
  const user = await tx.user.findFirst({
    where: {
      id: userId,
      emailVerified: true,
      sessions: { some: { id: sessionId, expiresAt: { gt: new Date() } } },
    },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    throw new AuthError("Your session expired. Please sign in again.");
  }
  return user;
};

export const readProfile = (userId: string) =>
  prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, description: true, showPremiumBadge: true },
  });

export const updateProfile = async (
  userId: string,
  sessionId: string,
  input: unknown,
) => {
  const data = profileSchema.parse(input);
  await consumeRateLimit("profile-change", userId, 30, 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await currentAccount(tx, userId, sessionId);
    const current = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { showPremiumBadge: true },
    });
    if (data.showPremiumBadge && !current.showPremiumBadge)
      await requirePremium(userId, tx);
    await tx.user.update({
      where: { id: userId },
      data: {
        name: data.name || null,
        description: data.description || null,
        showPremiumBadge: data.showPremiumBadge,
      },
    });
  });
};

const deletionImpact = async (tx: Prisma.TransactionClient, userId: string) => {
  const lists = await tx.wishlist.findMany({
    where: { ownerId: userId, archivedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      memberships: {
        where: {
          userId: { not: userId },
          role: "ADMIN",
          user: { emailVerified: true },
        },
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        take: 1,
        select: { userId: true, user: { select: { username: true } } },
      },
    },
  });
  const outcomes = lists.map(({ memberships, ...list }) => ({
    ...list,
    successor: memberships[0] ?? null,
  }));
  const reservations = await tx.reservation.findMany({
    where: { userId, endedAt: null },
    select: {
      id: true,
      groupEnabled: true,
      participants: {
        where: { status: "ACCEPTED" },
        select: { userId: true, acceptedAt: true },
        orderBy: { id: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  const groupMemberships = await tx.reservationParticipant.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "ACCEPTED"] },
      reservation: { endedAt: null },
    },
    select: { id: true, status: true },
    orderBy: { id: "asc" },
  });
  const memberships = await tx.membership.findMany({
    where: { userId },
    select: { id: true, role: true },
    orderBy: { id: "asc" },
  });

  const billing = await tx.billingAccount.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    select: {
      subscriptions: {
        where: { status: { not: "canceled" } },
        select: { id: true },
      },
      checkouts: { where: { closedAt: null }, select: { id: true } },
    },
  });

  return {
    subscriptionCount: billing.reduce(
      (sum, account) => sum + account.subscriptions.length,
      0,
    ),
    checkoutCount: billing.reduce(
      (sum, account) => sum + account.checkouts.length,
      0,
    ),
    outcomes,
    reservationCount: reservations.length,
    membershipCount: memberships.length,
    impactToken: hashToken(
      JSON.stringify({
        userId,
        outcomes,
        reservations,
        groupMemberships,
        memberships,
        billing,
      }),
    ),
  };
};

export const readDeletionImpact = async (userId: string) => {
  const impact = await prisma.$transaction((tx) => deletionImpact(tx, userId), {
    isolationLevel: "RepeatableRead",
  });

  return {
    impactToken: impact.impactToken,
    subscriptionCount: impact.subscriptionCount,
    checkoutCount: impact.checkoutCount,
    reservationCount: impact.reservationCount,
    membershipCount: impact.membershipCount,
    transferCount: impact.outcomes.filter((list) => list.successor).length,
    archiveCount: impact.outcomes.filter((list) => !list.successor).length,
    listCount: impact.outcomes.length,
    lists: impact.outcomes.slice(0, 20).map(({ id, title, successor }) => ({
      id,
      title,
      successor: successor?.user.username ?? null,
    })),
  };
};

export const deleteAccount = async (
  userId: string,
  sessionId: string,
  input: unknown,
) => {
  const data = deleteAccountSchema.parse(input);
  await consumeRateLimit("account-delete", userId, 5, 15 * 60 * 1000);
  const user = await currentAccount(prisma, userId, sessionId);

  if (!(await verifyPasswordHash(user.passwordHash, data.password))) {
    throw new AuthError("Incorrect current password");
  }

  const billingIds = await prisma.$transaction(
    async (tx) => {
      // Deletions can transfer to each other. Serialize this rare operation before
      // taking user/list locks; other account and content operations remain concurrent.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(8108, 1)::text`;
      await lockUser(tx, userId, true);
      const current = await currentAccount(tx, userId, sessionId);

      if (current.passwordHash !== user.passwordHash) {
        throw new AuthError("Your password changed. Please sign in again.");
      }

      // Lock every parent affected by cascades, in one consistent order.
      const affected = await tx.wishlist.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { memberships: { some: { userId } } },
            {
              wishes: {
                some: {
                  OR: [
                    { authorId: userId },
                    {
                      reservations: {
                        some: {
                          OR: [
                            { userId },
                            { participants: { some: { userId } } },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      for (const list of affected) {
        await lockWishlist(tx, list.id);
      }

      const impact = await deletionImpact(tx, userId);
      if (impact.impactToken !== data.impactToken) {
        throw new AuthError(
          "Your lists or reservations changed. Refresh this page and review the updated summary before deleting.",
        );
      }

      for (const list of impact.outcomes) {
        await tx.wishlist.update({
          where: { id: list.id },
          data: list.successor
            ? { ownerId: list.successor.userId }
            : { ownerId: null, archivedAt: new Date() },
        });
      }

      // Previously archived content must not appear in the review page. Detach
      // any retained ownership without changing its original archive date.
      await tx.wishlist.updateMany({
        where: { ownerId: userId, archivedAt: { not: null } },
        data: { ownerId: null },
      });

      // Only the personal avatar is deleted. List/wish images belong to retained
      // content; archived images remain inaccessible under the media access policy.
      await tx.media.updateMany({
        where: { userId },
        data: { userId: null, cleanupAfter: new Date() },
      });
      // Cascades revoke all sessions/tokens/memberships/reservations, while wishes
      // retain their content with a null author. Archiving ends all other reservations.
      await tx.invitation.deleteMany({ where: { email: current.email } });
      const billing = await tx.billingAccount.findMany({
        where: { userId },
        select: { id: true },
      });
      await detachBilling(tx, userId);
      await tx.user.delete({ where: { id: userId } });
      return billing.map((account) => account.id);
    },
    { timeout: 15_000 },
  );
  // The durable cancellation request survives account deletion and provider outages.
  await Promise.all(
    billingIds.map((id) => syncBillingAccount(id).catch(() => false)),
  );
};
