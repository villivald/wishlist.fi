import { consumeRateLimit, lockUser } from "@/features/auth/service/security";
import { publicLists, publicOwners } from "@/features/discovery/service/access";
import { imageSelection } from "@/features/media/types";
import { premiumGrantEnvironmentWhere } from "@/features/premium/service/entitlements";
import { readableWishes } from "@/features/wish/service/access";
import { wishPreviewSelection } from "@/features/wish/service/preview";
import { readableLists } from "@/features/wishlist/service/access";
import { lockWishlist } from "@/features/wishlist/service/lock";
import { readWishCounts } from "@/features/wishlist/service/wish-counts";
import { prisma } from "@/lib/prisma";
import { maxSearchPage, pageSize } from "@/utils/pagination";
import type { FavoriteKind } from "../types";
import { favoriteInput, parseFavoritesQuery } from "./schemas";

export class FavoriteError extends Error {}

const unavailable = "This item is unavailable or you no longer have access.";

export const setFavorite = async (userId: string, input: unknown) => {
  const { kind, targetId, saved } = favoriteInput.parse(input);
  await consumeRateLimit("favorite-change", userId, 100, 10 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    if (
      !(await tx.user.count({ where: { id: userId, emailVerified: true } }))
    ) {
      throw new FavoriteError("Verify your email to manage favorites.");
    }

    if (kind === "list") {
      const where = { userId, wishlistId: targetId };
      if (!saved) {
        await tx.favoriteList.deleteMany({ where });
        return;
      }
      await lockWishlist(tx, targetId);
      if (
        !(await tx.wishlist.count({
          where: { id: targetId, ...readableLists(userId) },
        }))
      ) {
        throw new FavoriteError(unavailable);
      }
      await tx.favoriteList.upsert({
        where: { userId_wishlistId: where },
        create: where,
        update: {},
      });
    } else if (kind === "wish") {
      const where = { userId, wishId: targetId };
      if (!saved) {
        await tx.favoriteWish.deleteMany({ where });
        return;
      }
      const parent = await tx.wish.findUnique({
        where: { id: targetId },
        select: { wishlistId: true },
      });
      if (!parent) throw new FavoriteError(unavailable);
      await lockWishlist(tx, parent.wishlistId);
      if (
        !(await tx.wish.count({
          where: { id: targetId, ...readableWishes(userId, true) },
        }))
      ) {
        throw new FavoriteError(unavailable);
      }
      await tx.favoriteWish.upsert({
        where: { userId_wishId: where },
        create: where,
        update: {},
      });
    } else {
      if (!saved) {
        await tx.favoritePerson.deleteMany({
          where: { userId, person: { username: targetId } },
        });
        return;
      }
      const person = await tx.user.findFirst({
        where: { username: targetId, ...publicOwners },
        select: { id: true },
      });
      if (!person) throw new FavoriteError(unavailable);
      const where = { userId, personId: person.id };
      await tx.favoritePerson.upsert({
        where: { userId_personId: where },
        create: where,
        update: {},
      });
    }
  });
};

// Bounded to the visible page, with no per-card queries or other users' bookmarks.
export const readFavoriteIds = async (
  userId: string | null,
  kind: FavoriteKind,
  targetIds: string[],
): Promise<string[]> => {
  if (!userId || !targetIds.length) return [];
  const where = { userId, user: { emailVerified: true } };
  if (kind === "list") {
    const rows = await prisma.favoriteList.findMany({
      where: { ...where, wishlistId: { in: targetIds } },
      select: { wishlistId: true },
    });
    return rows.map(({ wishlistId }) => wishlistId);
  }
  if (kind === "wish") {
    const rows = await prisma.favoriteWish.findMany({
      where: { ...where, wishId: { in: targetIds } },
      select: { wishId: true },
    });
    return rows.map(({ wishId }) => wishId);
  }
  const rows = await prisma.favoritePerson.findMany({
    where: { ...where, person: { username: { in: targetIds } } },
    select: { person: { select: { username: true } } },
  });
  return rows.map(({ person }) => person.username);
};

export const readFavorites = async (
  userId: string,
  query: { view?: string; page?: string } = {},
) => {
  const { view, page } = parseFavoritesQuery(query);
  const where = { userId, user: { emailVerified: true } };
  const pagination = {
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  };

  if (view === "lists") {
    const rows = await prisma.favoriteList.findMany({
      ...pagination,
      where: { ...where, wishlist: readableLists(userId) },
      select: {
        wishlist: {
          select: {
            id: true,
            ownerId: true,
            owner: { select: { name: true, username: true } },
            title: true,
            theme: true,
            description: true,
            publication: true,
            visibility: true,
            image: imageSelection,
            wishes: wishPreviewSelection,
            reservationsEnabled: true,
            memberships: {
              where: { userId, role: "ADMIN" },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });
    const counts = await readWishCounts(
      userId,
      rows.slice(0, pageSize).map(({ wishlist }) => wishlist.id),
    );
    return {
      view: "lists" as const,
      page,
      hasNextPage: rows.length > pageSize && page < maxSearchPage,
      lists: rows
        .slice(0, pageSize)
        .map(({ wishlist: { wishes, ownerId, memberships, ...list } }) => ({
          ...list,
          isOwner: ownerId === userId,
          canManage: memberships.length > 0,
          ...(counts.get(list.id) ?? {
            availableWishCount: 0,
            reservedWishCount: 0,
          }),
          previewImages: wishes.flatMap(({ image }) => (image ? [image] : [])),
        })),
    };
  }
  if (view === "wishes") {
    const rows = await prisma.favoriteWish.findMany({
      ...pagination,
      where: { ...where, wish: readableWishes(userId, true) },
      select: {
        wish: {
          select: {
            id: true,
            title: true,
            priceMinor: true,
            currency: true,
            priority: true,
            externalUrl: true,
            hidden: true,
            fulfilledAt: true,
            image: imageSelection,
            wishlist: {
              select: {
                id: true,
                title: true,
                ownerId: true,
                publication: true,
                reservationsEnabled: true,
                memberships: {
                  where: { userId, role: "ADMIN" },
                  select: { role: true },
                  take: 1,
                },
              },
            },
            reservations: {
              where: { endedAt: null },
              select: {
                userId: true,
                participants: {
                  where: { userId, status: "ACCEPTED" },
                  select: { id: true },
                },
              },
              take: 1,
            },
          },
        },
      },
    });
    return {
      view: "wishes" as const,
      page,
      hasNextPage: rows.length > pageSize && page < maxSearchPage,
      wishes: rows.slice(0, pageSize).map(
        ({
          wish: {
            reservations,
            wishlist: { ownerId, memberships, publication, ...wishlist },
            ...wish
          },
        }) => ({
          ...wish,
          wishlist: { ...wishlist, isOwner: ownerId === userId },
          canManage: memberships.length > 0,
          canReserve:
            wishlist.reservationsEnabled &&
            publication === "PUBLISHED" &&
            !wish.hidden &&
            !wish.fulfilledAt &&
            reservations.length === 0,
          isReserved: reservations.length > 0,
          isReservedByYou: reservations.some(
            (reservation) =>
              reservation.userId === userId ||
              reservation.participants.length > 0,
          ),
        }),
      ),
    };
  }
  const rows = await prisma.favoritePerson.findMany({
    ...pagination,
    where: { ...where, person: publicOwners },
    select: {
      person: {
        select: {
          id: true,
          username: true,
          showPremiumBadge: true,
          name: true,
          description: true,
          image: imageSelection,
          _count: {
            select: {
              ownedLists: { where: publicLists },
              premiumGrants: {
                where: {
                  ...premiumGrantEnvironmentWhere(),
                  revokedAt: null,
                  startsAt: { lte: new Date() },
                  expiresAt: { gt: new Date() },
                },
              },
            },
          },
        },
      },
    },
  });
  return {
    view: "people" as const,
    page,
    hasNextPage: rows.length > pageSize && page < maxSearchPage,
    people: rows
      .slice(0, pageSize)
      .map(({ person: { id, _count, ...person } }) => ({
        ...person,
        publicListCount: _count.ownedLists,
        showPremiumBadge: person.showPremiumBadge && _count.premiumGrants > 0,
        isViewer: id === userId,
      })),
  };
};

export const readFavoriteCounts = async (userId: string) => {
  const where = { userId, user: { emailVerified: true } };
  const [lists, wishes, people] = await prisma.$transaction(
    [
      prisma.favoriteList.count({
        where: { ...where, wishlist: readableLists(userId) },
      }),
      prisma.favoriteWish.count({
        where: { ...where, wish: readableWishes(userId, true) },
      }),
      prisma.favoritePerson.count({
        where: { ...where, person: publicOwners },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  return { lists, wishes, people };
};
