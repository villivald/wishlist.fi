import { consumeRateLimit } from "@/features/auth/service/security";
import { requirePremium } from "@/features/premium/service/entitlements";
import { lockSharing, requireAdmin } from "@/features/sharing/service/access";
import { sharingPage } from "@/features/sharing/service/schemas";
import { manageableLists } from "@/features/wishlist/service/access";
import { prisma } from "@/lib/prisma";
import { generateRandomToken, hashToken } from "@/utils/crypto";
import { pageCount, pageSize } from "@/utils/pagination";
import { guestLinkSchema } from "./schemas";

export const createGuestLink = async (
  userId: string,
  sessionId: string,
  listId: string,
  input: unknown,
) => {
  const data = guestLinkSchema.parse(input);
  await consumeRateLimit("guest-link-create", userId, 30, 60 * 60 * 1000);
  return prisma.$transaction(async (tx) => {
    const { list, role } = await lockSharing(tx, userId, sessionId, listId);
    requireAdmin(role);
    await requirePremium(list.ownerId!, tx);
    const token = generateRandomToken();
    const link = await tx.guestLink.create({
      data: {
        label: data.label,
        tokenHash: hashToken(token),
        wishlistId: listId,
        expiresAt: new Date(Date.now() + data.days * 86400000),
      },
      select: { id: true, expiresAt: true },
    });
    return { ...link, token };
  });
};

export const revokeGuestLink = async (
  userId: string,
  sessionId: string,
  listId: string,
  id: string,
) => {
  await prisma.$transaction(async (tx) => {
    const { role } = await lockSharing(tx, userId, sessionId, listId);
    requireAdmin(role);
    await tx.guestLink.updateMany({
      where: { id, wishlistId: listId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
};

export const readGuestLinks = async (
  listId: string,
  userId: string,
  input: unknown = 1,
) => {
  const page = sharingPage(input);
  const list = await prisma.wishlist.findFirst({
    where: { id: listId, ...manageableLists(userId) },
    select: {
      id: true,
      title: true,
      ownerId: true,
      publication: true,
      _count: { select: { guestLinks: true } },
      guestLinks: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, label: true, expiresAt: true, revokedAt: true },
      },
    },
  });
  if (!list) return null;
  const { _count, ...details } = list;
  const totalPages = pageCount(_count.guestLinks);
  return {
    ...details,
    page,
    totalPages,
    hasNextPage: page < totalPages,
  };
};
