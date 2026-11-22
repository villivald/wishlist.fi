import { imageSelection } from "@/features/media/types";
import { premiumGrantEnvironmentWhere } from "@/features/premium/service/entitlements";
import { wishPreviewSelection } from "@/features/wish/service/preview";
import { readWishCounts } from "@/features/wishlist/service/wish-counts";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { availableWishes, publicLists, publicOwners } from "./access";
import {
  curatedListSettings,
  findCuratedWishlistIdsByCopy,
  readCuratedWishlistIds,
} from "./curated-lists";
import { peopleOrderedByName } from "./people-order";
import { type DiscoveryQuery, parseDiscoveryQuery } from "./query";

const literalSearch = (value: string) => value.replace(/[\\%_]/g, "\\$&");

const wishOrder = {
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  title: [{ title: "asc" }, { id: "asc" }],
  priority: [
    { priority: { sort: "desc", nulls: "last" } },
    { createdAt: "desc" },
    { id: "desc" },
  ],
  "price-low": [{ priceMinor: "asc" }, { id: "asc" }],
  "price-high": [{ priceMinor: "desc" }, { id: "desc" }],
} satisfies Record<string, Prisma.WishOrderByWithRelationInput[]>;

const discoveryListSelection = {
  id: true,
  ownerId: true,
  owner: { select: { name: true, username: true } },
  title: true,
  theme: true,
  description: true,
  image: imageSelection,
  publication: true,
  visibility: true,
  reservationsEnabled: true,
  wishes: wishPreviewSelection,
} satisfies Prisma.WishlistSelect;

export const discoverLists = async (
  query: DiscoveryQuery,
  viewerId: string | null = null,
) => {
  const filters = parseDiscoveryQuery({ ...query, view: "lists" });
  if (filters.error) {
    return { filters, lists: [], curatedLists: [], hasNextPage: false };
  }

  const defaultListView =
    !filters.owner &&
    !filters.reservable &&
    !filters.q &&
    filters.sort === "newest";
  const curatedIds = defaultListView ? readCuratedWishlistIds() : [];
  const copyMatches = filters.q ? findCuratedWishlistIdsByCopy(filters.q) : [];

  const listQuery = prisma.wishlist.findMany({
    where: {
      ...publicLists,
      ...(curatedIds.length
        ? {
            NOT: {
              id: { in: curatedIds },
              reservationsEnabled: curatedListSettings.reservationsEnabled,
            },
          }
        : {}),
      ...(filters.owner
        ? { owner: { username: filters.owner, emailVerified: true } }
        : {}),
      ...(filters.reservable ? { reservationsEnabled: true } : {}),
      ...(filters.q
        ? {
            OR: [
              {
                title: {
                  contains: literalSearch(filters.q),
                  mode: "insensitive",
                },
              },
              {
                description: {
                  contains: literalSearch(filters.q),
                  mode: "insensitive",
                },
              },
              ...(copyMatches.length
                ? [{ ...curatedListSettings, id: { in: copyMatches } }]
                : []),
            ],
          }
        : {}),
    },
    select: discoveryListSelection,
    orderBy:
      filters.sort === "title"
        ? [{ title: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
    skip: (filters.page - 1) * 20,
    take: 21,
  });
  // Both reads must agree on eligibility while list settings are changing.
  const [lists, featured] =
    curatedIds.length && filters.page === 1
      ? await prisma.$transaction(
          [
            listQuery,
            prisma.wishlist.findMany({
              where: {
                ...publicLists,
                ...curatedListSettings,
                id: { in: curatedIds },
              },
              select: discoveryListSelection,
            }),
          ],
          { isolationLevel: "RepeatableRead" },
        )
      : [await listQuery, []];

  const pageLists = lists.slice(0, 20);
  const featuredById = new Map(featured.map((list) => [list.id, list]));
  const counts = await readWishCounts(
    viewerId,
    [...pageLists, ...featured].map(({ id }) => id),
  );
  const toCard = ({ ownerId, wishes, ...list }: (typeof lists)[number]) => ({
    ...list,
    isOwner: !!viewerId && ownerId === viewerId,
    previewImages: wishes.flatMap(({ image }) => (image ? [image] : [])),
    ...(counts.get(list.id) ?? {
      availableWishCount: 0,
      reservedWishCount: 0,
    }),
  });

  return {
    filters,
    lists: pageLists.map(toCard),
    curatedLists: curatedIds.flatMap((id) => {
      const list = featuredById.get(id);
      return list ? [toCard(list)] : [];
    }),
    hasNextPage: lists.length > 20 && filters.page < 1000,
  };
};

export const discoverWishes = async (
  query: DiscoveryQuery,
  viewerId: string | null = null,
) => {
  const filters = parseDiscoveryQuery({ ...query, view: "wishes" });
  const wishes = filters.error
    ? []
    : await prisma.wish.findMany({
        where: {
          ...availableWishes,
          wishlist: {
            ...publicLists,
            ...(filters.owner
              ? { owner: { username: filters.owner, emailVerified: true } }
              : {}),
            ...(filters.reservable ? { reservationsEnabled: true } : {}),
          },
          ...(filters.q
            ? {
                OR: [
                  {
                    title: {
                      contains: literalSearch(filters.q),
                      mode: "insensitive",
                    },
                  },
                  {
                    description: {
                      contains: literalSearch(filters.q),
                      mode: "insensitive",
                    },
                  },
                  {
                    wishlist: {
                      title: {
                        contains: literalSearch(filters.q),
                        mode: "insensitive",
                      },
                    },
                  },
                ],
              }
            : {}),
          ...(filters.currency ? { currency: filters.currency } : {}),
          ...(filters.priority
            ? { priority: { gte: Number(filters.priority) } }
            : {}),
          ...(filters.minPrice !== null || filters.maxPrice !== null
            ? {
                priceMinor: {
                  ...(filters.minPrice !== null
                    ? { gte: filters.minPrice }
                    : {}),
                  ...(filters.maxPrice !== null
                    ? { lte: filters.maxPrice }
                    : {}),
                },
              }
            : {}),
        },
        select: {
          id: true,
          title: true,
          description: true,
          externalUrl: true,
          image: imageSelection,
          priceMinor: true,
          currency: true,
          priority: true,
          wishlist: {
            select: {
              id: true,
              title: true,
              ownerId: true,
              reservationsEnabled: true,
            },
          },
        },
        orderBy: wishOrder[filters.sort],
        skip: (filters.page - 1) * 20,
        take: 21,
      });

  return {
    filters,
    wishes: wishes
      .slice(0, 20)
      .map(({ wishlist: { ownerId, ...wishlist }, ...wish }) => ({
        ...wish,
        wishlist: { ...wishlist, isOwner: !!viewerId && ownerId === viewerId },
      })),
    hasNextPage: !filters.error && wishes.length > 20 && filters.page < 1000,
  };
};

export const discoverUsers = async (
  query: DiscoveryQuery,
  viewerId: string | null = null,
) => {
  const filters = parseDiscoveryQuery({ ...query, view: "users" });
  const orderedPeople =
    !filters.error && filters.sort === "title"
      ? await peopleOrderedByName(literalSearch(filters.q), filters.page)
      : null;
  const users = filters.error
    ? []
    : await prisma.user.findMany({
        where: {
          ...publicOwners,
          ...(orderedPeople
            ? { id: { in: orderedPeople.map(({ id }) => id) } }
            : {}),
          ...(filters.q
            ? {
                OR: [
                  {
                    name: {
                      contains: literalSearch(filters.q),
                      mode: "insensitive",
                    },
                  },
                  {
                    username: {
                      contains: literalSearch(filters.q),
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {}),
        },
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: orderedPeople ? 0 : (filters.page - 1) * 20,
        take: 21,
      });

  const positions = new Map(orderedPeople?.map(({ id }, index) => [id, index]));
  const sortedUsers = orderedPeople
    ? users.toSorted(
        (first, second) => positions.get(first.id)! - positions.get(second.id)!,
      )
    : users;

  return {
    filters,
    users: sortedUsers.slice(0, 20).map(({ id, _count, ...user }) => ({
      ...user,
      isViewer: id === viewerId,
      publicListCount: _count.ownedLists,
      showPremiumBadge: user.showPremiumBadge && _count.premiumGrants > 0,
    })),
    hasNextPage: !filters.error && users.length > 20 && filters.page < 1000,
  };
};
