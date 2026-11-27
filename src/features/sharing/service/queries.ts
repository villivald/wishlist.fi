import { publicOwners } from "@/features/discovery/service/access";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import { manageableLists } from "@/features/wishlist/service/access";
import { prisma } from "@/lib/prisma";
import { pageCount, pageSize } from "@/utils/pagination";
import { sharingPage } from "./schemas";

export const readSharing = async (
  listId: string,
  userId: string,
  memberPage: unknown = 1,
  invitePage: unknown = 1,
) => {
  const membersPage = sharingPage(memberPage);
  const invitationsPage = sharingPage(invitePage);
  const pendingInvitations = { acceptedAt: null, revokedAt: null };
  const list = await prisma.wishlist.findFirst({
    where: { id: listId, ...manageableLists(userId) },
    select: {
      id: true,
      title: true,
      ownerId: true,
      visibility: true,
      publication: true,
      _count: {
        select: {
          memberships: true,
          invitations: { where: pendingInvitations },
          guestLinks: {
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
          },
        },
      },
      memberships: {
        orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
        skip: (membersPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          userId: true,
          role: true,
          user: { select: { username: true } },
        },
      },
      invitations: {
        where: pendingInvitations,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (invitationsPage - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          recipient: { select: { id: true, name: true, username: true } },
          role: true,
          expiresAt: true,
          sentAt: true,
          deliveryFailedAt: true,
        },
      },
    },
  });
  if (!list) return null;
  const [access, pending] = await Promise.all([
    readPremiumAccess(list.ownerId!),
    prisma.invitation.findMany({
      where: {
        wishlistId: listId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { email: true, recipientId: true },
    }),
  ]);
  const pendingEmails = pending.map(({ email }) => email);
  const [favorites, previousRecipients] =
    access.plan === "PREMIUM"
      ? await Promise.all([
          prisma.favoritePerson.findMany({
            where: {
              userId,
              person: {
                ...publicOwners,
                id: {
                  not: userId,
                  notIn: pending.flatMap(({ recipientId }) =>
                    recipientId ? [recipientId] : [],
                  ),
                },
                email: { notIn: pendingEmails },
                memberships: { none: { wishlistId: listId } },
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 12,
            select: {
              person: { select: { id: true, name: true, username: true } },
            },
          }),
          prisma.invitation.findMany({
            where: {
              inviterId: userId,
              recipientId: null,
              wishlistId: { not: listId },
              revokedAt: null,
              acceptedAt: { not: null },
              wishlist: { archivedAt: null },
              email: { notIn: pendingEmails },
            },
            distinct: ["email"],
            orderBy: { createdAt: "desc" },
            take: 12,
            select: { email: true },
          }),
        ])
      : [[], []];
  const emails = previousRecipients.map(({ email }) => email);
  const recipients = emails.length
    ? await prisma.user.findMany({
        where: {
          id: { not: userId, notIn: favorites.map(({ person }) => person.id) },
          email: { in: emails },
          emailVerified: true,
          memberships: { none: { wishlistId: listId } },
        },
        select: { email: true, username: true },
      })
    : [];
  const memberPages = pageCount(list._count.memberships);
  const invitationPages = pageCount(list._count.invitations);
  return {
    ...list,
    favorites: favorites.map(({ person }) => person),
    previousRecipients: recipients,
    premium: access.plan === "PREMIUM",
    // Never serialize the private delivery address of an account invitation.
    invitations: list.invitations.map(
      ({ email, recipient, ...invitation }) => ({
        ...invitation,
        recipient,
        email: recipient ? null : email,
      }),
    ),
    membersPage,
    invitationsPage,
    memberPages,
    invitationPages,
    moreMembers: membersPage < memberPages,
    moreInvitations: invitationsPage < invitationPages,
  };
};
