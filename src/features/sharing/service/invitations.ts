import { consumeRateLimit } from "@/features/auth/service/security";
import { publicOwners } from "@/features/discovery/service/access";
import {
  readPremiumAccess,
  requirePremium,
} from "@/features/premium/service/entitlements";
import { listAccess } from "@/features/wishlist/list-access";
import type { Prisma } from "@/generated/prisma/client";
import {
  backgroundEvents,
  publishBackgroundEvents,
} from "@/lib/background-events";
import { prisma } from "@/lib/prisma";
import { queueInvitationAcceptedEmail } from "./acceptance-email";
import { lockSharing, requireAdmin, SharingError } from "./access";
import { favoriteInvitationSchema, invitationSchema } from "./schemas";

const unavailable =
  "This invitation is unavailable. Sign in with the invited email or ask the list admin for a new invitation.";

export const activeInvitation = (
  now = new Date(),
): Prisma.InvitationWhereInput => ({
  acceptedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
  wishlist: { archivedAt: null },
});

export const inviteMember = async (
  userId: string,
  sessionId: string,
  listId: string,
  input: unknown,
  locale = "en",
) => {
  const data =
    input && typeof input === "object" && "recipientId" in input
      ? favoriteInvitationSchema.parse(input)
      : invitationSchema.parse(input);
  await consumeRateLimit("invite-create", userId, 20, 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const { user, list, role } = await lockSharing(
      tx,
      userId,
      sessionId,
      listId,
    );
    requireAdmin(role);
    await requirePremium(list.ownerId!, tx);
    if (data.expectedAccess && data.expectedAccess !== listAccess(list))
      throw new SharingError(
        "List access changed. Refresh this page and review it before continuing.",
      );
    if (data.shareAccess === "PRIVATE") {
      if (
        list.publication !== "DRAFT" ||
        data.role !== "MEMBER" ||
        data.expectedAccess !== "HIDDEN"
      )
        throw new SharingError(
          "List access changed. Refresh this page and review it before continuing.",
        );
      // Invitation validation and creation share this transaction; failures roll back access too.
      await tx.wishlist.update({
        where: { id: listId },
        data: { publication: "PUBLISHED", visibility: "PRIVATE" },
      });
    }
    const favorite =
      "recipientId" in data
        ? await tx.user.findFirst({
            where: {
              ...publicOwners,
              id: data.recipientId,
              NOT: { id: userId },
              favoritedBy: { some: { userId } },
            },
            select: { id: true, email: true, locale: true },
          })
        : null;
    if ("recipientId" in data && !favorite) {
      throw new SharingError(
        "This favorite is no longer available. Choose another person or enter an email address.",
      );
    }
    const email = "email" in data ? data.email : favorite!.email;
    const member = await tx.membership.findFirst({
      where: { wishlistId: listId, user: { email } },
      select: { id: true },
    });
    if (member) {
      throw new SharingError("This person already belongs to this list.");
    }
    const previous = await tx.invitation.findFirst({
      where: {
        wishlistId: listId,
        OR: [{ email }, ...(favorite ? [{ recipientId: favorite.id }] : [])],
        acceptedAt: null,
        revokedAt: null,
      },
    });
    if (previous && previous.expiresAt > new Date()) {
      if (
        previous.role !== data.role ||
        previous.email !== email ||
        previous.deliveryFailedAt ||
        (favorite && previous.recipientId !== favorite.id)
      ) {
        throw new SharingError(
          "Revoke the pending invitation before creating a replacement.",
        );
      }
      return { id: previous.id };
    }
    if (previous) {
      await tx.invitation.update({
        where: { id: previous.id },
        data: { revokedAt: new Date() },
      });
    }
    await consumeRateLimit("invite-recipient", email, 5, 60 * 60 * 1000);
    const recipient =
      favorite ??
      (await tx.user.findUnique({
        where: { email },
        select: { locale: true },
      }));
    return tx.invitation.create({
      data: {
        email,
        role: data.role,
        recipientId: favorite?.id,
        locale: recipient?.locale ?? locale,
        wishlistId: listId,
        inviterId: userId,
        emailListTitle: list.title,
        emailInviterUsername: user.username,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
      select: { id: true },
    });
  });
};

export const revokeInvitation = async (
  userId: string,
  sessionId: string,
  listId: string,
  invitationId: string,
) => {
  await prisma.$transaction(async (tx) => {
    const { role } = await lockSharing(tx, userId, sessionId, listId);
    requireAdmin(role);
    await tx.invitation.updateMany({
      where: {
        id: invitationId,
        wishlistId: listId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  });
};

export const readInvitation = async (id: string, userId: string) => {
  const user = await prisma.user.findFirst({
    where: { id: userId, emailVerified: true },
    select: { email: true },
  });
  if (!user) return null;
  const invitation = await prisma.invitation.findFirst({
    where: {
      id,
      email: user.email,
      OR: [{ recipientId: null }, { recipientId: userId }],
      ...activeInvitation(),
    },
    select: {
      id: true,
      role: true,
      expiresAt: true,
      inviterId: true,
      wishlistId: true,
      wishlist: { select: { ownerId: true, publication: true } },
    },
  });
  if (!invitation) return null;
  const inviter = await prisma.membership.findFirst({
    where: {
      wishlistId: invitation.wishlistId,
      userId: invitation.inviterId,
      role: "ADMIN",
      user: { emailVerified: true },
    },
    select: { user: { select: { username: true } } },
  });
  if (!inviter) return null;
  const access = await readPremiumAccess(invitation.wishlist.ownerId!);
  return {
    id: invitation.id,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    hidden: invitation.wishlist.publication === "DRAFT",
    canAccept: access.plan === "PREMIUM",
    invitedBy: inviter.user.username,
  };
};

export const acceptInvitation = async (
  userId: string,
  sessionId: string,
  invitationId: string,
) => {
  await consumeRateLimit("invite-accept", userId, 20, 15 * 60 * 1000);
  const locator = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { wishlistId: true },
  });
  if (!locator) throw new SharingError(unavailable);
  const result = await prisma.$transaction(async (tx) => {
    const { user, list } = await lockSharing(
      tx,
      userId,
      sessionId,
      locator.wishlistId,
    );
    const invitation = await tx.invitation.findFirst({
      where: {
        id: invitationId,
        email: user.email,
        OR: [{ recipientId: null }, { recipientId: userId }],
        ...activeInvitation(),
      },
    });
    if (!invitation) throw new SharingError(unavailable);
    const inviter = await tx.membership.findFirst({
      where: {
        wishlistId: list.id,
        userId: invitation.inviterId,
        role: "ADMIN",
        user: { emailVerified: true },
      },
      select: { id: true },
    });
    if (!inviter) throw new SharingError(unavailable);
    await requirePremium(list.ownerId!, tx);
    // Never promote an existing member through an old invitation.
    await tx.membership.upsert({
      where: { wishlistId_userId: { wishlistId: list.id, userId } },
      create: { wishlistId: list.id, userId, role: invitation.role },
      update: {},
    });
    await tx.invitation.update({
      where: { id: invitationId },
      data: { acceptedAt: new Date() },
    });
    const emailId = await queueInvitationAcceptedEmail(
      tx,
      { ...invitation, listTitle: list.title },
      userId,
    );
    return { listId: list.id, emailId };
  });
  await publishBackgroundEvents(backgroundEvents.accountEmail, [
    result.emailId,
  ]);
  return { listId: result.listId };
};
