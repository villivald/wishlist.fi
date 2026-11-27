import { z } from "zod";
import { emailSchema } from "@/features/auth/service/schemas";
import { consumeRateLimit, lockUser } from "@/features/auth/service/security";
import { publicOwners } from "@/features/discovery/service/access";
import { imageSelection } from "@/features/media/types";
import { readableLists } from "@/features/wishlist/service/access";
import { lockWishlist } from "@/features/wishlist/service/lock";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";
import type { Prisma } from "@/generated/prisma/client";
import {
  backgroundEvents,
  publishBackgroundEvents,
} from "@/lib/background-events";
import { prisma } from "@/lib/prisma";
import { maxPage, pageSize, readPageCount } from "@/utils/pagination";
import { participantReservation } from "./access";
import { queueGroupEmail } from "./group-emails";
import { ReservationError, verifyActor } from "./reservations";

export const GROUP_LIMIT = 10;
const invitationLifetime = 7 * 24 * 60 * 60 * 1000;
const unavailable = "This group is unavailable or you no longer have access.";
const profile = {
  id: true,
  username: true,
  name: true,
} satisfies Prisma.UserSelect;
const activePeople = (
  now = new Date(),
): Prisma.ReservationParticipantWhereInput => ({
  OR: [{ status: "ACCEPTED" }, { status: "PENDING", expiresAt: { gt: now } }],
});
const accessibleWish = (userId: string): Prisma.WishWhereInput => ({
  hidden: false,
  fulfilledAt: null,
  wishlist: { ...readableLists(userId), publication: "PUBLISHED" },
});
// Group mutations share the account-deletion gate, then acquire user locks in
// stable order before the parent list. No foreign-key write can race deletion.
const changeGroup = async <T>(
  userId: string,
  reservationId: string,
  target: string | { email: string } | null,
  change: (
    tx: Prisma.TransactionClient,
    group: NonNullable<Awaited<ReturnType<typeof lockedGroup>>>,
    targetId: string | null,
  ) => Promise<T>,
) => {
  wishlistIdSchema.parse(reservationId);
  if (typeof target === "string") wishlistIdSchema.parse(target);
  await consumeRateLimit(
    "reservation-group-change",
    userId,
    40,
    10 * 60 * 1000,
  );
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(8108, 1)::text`;
    const targetId =
      target && typeof target === "object"
        ? ((
            await tx.user.findUnique({
              where: { email: target.email },
              select: { id: true },
            })
          )?.id ?? null)
        : target;
    for (const id of [
      ...new Set([userId, ...(targetId ? [targetId] : [])]),
    ].sort())
      await lockUser(tx, id);
    await verifyActor(tx, userId);
    const group = await lockedGroup(tx, userId, reservationId);
    return change(tx, group, targetId);
  });
};

const lockedGroup = async (
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
) => {
  const location = await tx.reservation.findUnique({
    where: { id },
    select: { wish: { select: { wishlistId: true } } },
  });
  if (!location) throw new ReservationError(unavailable);
  await lockWishlist(tx, location.wish.wishlistId);
  const group = await tx.reservation.findFirst({
    where: { id, endedAt: null, wish: accessibleWish(userId) },
    select: {
      id: true,
      userId: true,
      groupEnabled: true,
      wish: {
        select: {
          id: true,
          wishlistId: true,
          wishlist: { select: { visibility: true, reservationsEnabled: true } },
        },
      },
    },
  });
  if (!group) throw new ReservationError(unavailable);
  return group;
};
const requireOrganizer = (group: { userId: string }, userId: string) => {
  if (group.userId !== userId) throw new ReservationError(unavailable);
};
const requireEnabled = (enabled: boolean) => {
  if (!enabled)
    throw new ReservationError(
      "New group invitations and acceptance are disabled for this list.",
    );
};

export const enableReservationGroup = (userId: string, reservationId: string) =>
  changeGroup(userId, reservationId, null, async (tx, group) => {
    requireOrganizer(group, userId);
    requireEnabled(group.wish.wishlist.reservationsEnabled);
    await tx.reservation.update({
      where: { id: group.id },
      data: { groupEnabled: true },
    });
  });

const eligiblePeople = (
  listId: string,
  visibility: string,
): Prisma.UserWhereInput => ({
  emailVerified: true,
  AND: [
    { OR: [publicOwners, { memberships: { some: { wishlistId: listId } } }] },
    ...(visibility === "PRIVATE"
      ? [{ memberships: { some: { wishlistId: listId } } }]
      : []),
  ],
});

const availableGroupRecipients = (
  userId: string,
  reservationId: string,
  listId: string,
  visibility: string,
): Prisma.UserWhereInput => ({
  ...eligiblePeople(listId, visibility),
  id: { not: userId },
  reservationParticipants: { none: { reservationId } },
});

export const searchGroupPeople = async (
  userId: string,
  reservationId: string,
  input: unknown,
) => {
  const query = z.string().trim().min(2).max(80).safeParse(input);
  if (!query.success) return [];
  await consumeRateLimit(
    "reservation-group-search",
    userId,
    60,
    10 * 60 * 1000,
  );
  return prisma.$transaction(
    async (tx) => {
      const group = await tx.reservation.findFirst({
        where: {
          id: reservationId,
          userId,
          groupEnabled: true,
          endedAt: null,
          user: { emailVerified: true },
          wish: accessibleWish(userId),
        },
        select: {
          wish: {
            select: {
              wishlistId: true,
              wishlist: {
                select: { visibility: true, reservationsEnabled: true },
              },
            },
          },
        },
      });
      if (!group || !group.wish.wishlist.reservationsEnabled) return [];
      const people = await tx.user.findMany({
        where: {
          ...availableGroupRecipients(
            userId,
            reservationId,
            group.wish.wishlistId,
            group.wish.wishlist.visibility,
          ),
          OR: [
            { username: { contains: query.data, mode: "insensitive" } },
            { name: { contains: query.data, mode: "insensitive" } },
          ],
        },
        select: profile,
        orderBy: [{ username: "asc" }, { id: "asc" }],
        take: 10,
      });
      // Private members remain searchable within their list, but their avatars
      // must obey the existing public-profile media policy.
      const images = await tx.media.findMany({
        where: {
          userId: { in: people.map((person) => person.id) },
          user: publicOwners,
          state: "READY",
        },
        select: { ...imageSelection.select, userId: true },
      });
      return people.map((person) => {
        const image = images.find((image) => image.userId === person.id);
        return {
          ...person,
          image: image
            ? {
                id: image.id,
                alt: "",
                width: image.width,
                height: image.height,
                variantWidths: image.variantWidths,
              }
            : null,
        };
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
};

export const inviteToReservation = async (
  userId: string,
  reservationId: string,
  recipient: string | { email: string },
) => {
  const target =
    typeof recipient === "string"
      ? recipient
      : { email: emailSchema.parse(recipient.email) };
  const emailId = await changeGroup(
    userId,
    reservationId,
    target,
    async (tx, group, targetId) => {
      requireOrganizer(group, userId);
      requireEnabled(group.wish.wishlist.reservationsEnabled);
      if (!group.groupEnabled) throw new ReservationError(unavailable);
      const recipientUnavailable =
        typeof target === "string"
          ? unavailable
          : "This address cannot receive a group invitation. Check the address and that the person can access the list.";
      if (!targetId || targetId === userId)
        throw new ReservationError(recipientUnavailable);
      const person = await tx.user.findFirst({
        where: {
          id: targetId,
          ...(typeof target === "string" ? {} : { email: target.email }),
          ...eligiblePeople(
            group.wish.wishlistId,
            group.wish.wishlist.visibility,
          ),
        },
        select: { id: true },
      });
      if (!person) throw new ReservationError(recipientUnavailable);
      const existing = await tx.reservationParticipant.findUnique({
        where: { reservationId_userId: { reservationId, userId: targetId } },
        select: { id: true },
      });
      if (existing)
        throw new ReservationError(
          "This person has already been invited to this reservation.",
        );
      const count = await tx.reservationParticipant.count({
        where: { reservationId, ...activePeople() },
      });
      if (count >= GROUP_LIMIT - 1)
        throw new ReservationError(
          "A group can include up to ten people, including pending invitations.",
        );
      // Cross-reservation protection prevents repeatedly inviting the same person
      // by canceling and recreating a reservation. Declines never notify the inviter.
      await consumeRateLimit(
        "reservation-group-invite-pair",
        `${userId}:${targetId}`,
        3,
        24 * 60 * 60 * 1000,
        tx,
      );
      await consumeRateLimit(
        "reservation-group-invite-recipient",
        targetId,
        10,
        60 * 60 * 1000,
        tx,
      );
      const invitation = await tx.reservationParticipant.create({
        data: {
          reservationId,
          userId: targetId,
          inviterId: userId,
          expiresAt: new Date(Date.now() + invitationLifetime),
        },
      });
      return queueGroupEmail(tx, {
        participantId: invitation.id,
        reservationId,
        recipientId: targetId,
        actorId: userId,
        kind: "INVITED",
      });
    },
  );
  await publishBackgroundEvents(backgroundEvents.accountEmail, [emailId]);
};

export const respondToReservation = async (
  userId: string,
  reservationId: string,
  accept: boolean,
) => {
  const emailId = await changeGroup(
    userId,
    reservationId,
    null,
    async (tx, group) => {
      const invitation = await tx.reservationParticipant.findUnique({
        where: { reservationId_userId: { reservationId, userId } },
      });
      if (
        !group.groupEnabled ||
        !invitation ||
        invitation.status !== "PENDING" ||
        invitation.expiresAt <= new Date()
      )
        throw new ReservationError(unavailable);
      if (accept) requireEnabled(group.wish.wishlist.reservationsEnabled);
      await tx.reservationParticipant.update({
        where: { id: invitation.id },
        data: {
          status: accept ? "ACCEPTED" : "DECLINED",
          acceptedAt: accept ? new Date() : null,
        },
      });
      if (accept)
        return queueGroupEmail(tx, {
          participantId: invitation.id,
          reservationId,
          recipientId: group.userId,
          actorId: userId,
          kind: "ACCEPTED",
        });
    },
  );
  await publishBackgroundEvents(backgroundEvents.accountEmail, [emailId]);
};

export const removeReservationParticipant = (
  userId: string,
  reservationId: string,
  targetId: string,
) =>
  changeGroup(userId, reservationId, targetId, async (tx, group) => {
    if (!group.groupEnabled || (userId !== targetId && userId !== group.userId))
      throw new ReservationError(unavailable);
    if (targetId === group.userId)
      throw new ReservationError(
        "Transfer coordination before leaving, or cancel the reservation for everyone.",
      );
    const result = await tx.reservationParticipant.updateMany({
      where: {
        reservationId,
        userId: targetId,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      data: { status: userId === targetId ? "LEFT" : "REVOKED" },
    });
    if (!result.count) throw new ReservationError(unavailable);
  });

export const transferReservation = (
  userId: string,
  reservationId: string,
  targetId: string,
) =>
  changeGroup(userId, reservationId, targetId, async (tx, group) => {
    requireOrganizer(group, userId);
    const successor = await tx.reservationParticipant.findFirst({
      where: {
        reservationId,
        userId: targetId,
        status: "ACCEPTED",
        user: { emailVerified: true },
        reservation: { wish: accessibleWish(targetId) },
      },
    });
    if (!group.groupEnabled || !successor)
      throw new ReservationError(unavailable);
    await tx.reservationParticipant.update({
      where: { id: successor.id },
      data: { status: "LEFT" },
    });
    await tx.reservationParticipant.upsert({
      where: { reservationId_userId: { reservationId, userId } },
      create: {
        reservationId,
        userId,
        expiresAt: new Date(),
        acceptedAt: new Date(),
        status: "ACCEPTED",
      },
      update: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await tx.reservation.update({
      where: { id: reservationId },
      data: { userId: targetId },
    });
    await tx.reservationParticipant.updateMany({
      where: { reservationId, status: "PENDING" },
      data: { status: "REVOKED" },
    });
  });

export const readReservationGroup = async (
  userId: string,
  reservationId: string,
) => {
  if (!wishlistIdSchema.safeParse(reservationId).success) return null;
  return prisma.$transaction(
    async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: {
          id: reservationId,
          groupEnabled: true,
          endedAt: null,
          wish: accessibleWish(userId),
          OR: [
            ...participantReservation(userId).OR!,
            {
              participants: {
                some: {
                  userId,
                  status: "PENDING",
                  expiresAt: { gt: new Date() },
                  user: { emailVerified: true },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          userId: true,
          wish: {
            select: {
              id: true,
              title: true,
              description: true,
              priceMinor: true,
              currency: true,
              priority: true,
              wishlistId: true,
              wishlist: {
                select: {
                  title: true,
                  visibility: true,
                  reservationsEnabled: true,
                },
              },
            },
          },
        },
      });
      if (!reservation) return null;
      // Sibling relation selections fan out on Prisma's single transaction
      // connection. Read them sequentially while retaining the same snapshot.
      const participants = await tx.reservationParticipant.findMany({
        where: { reservationId, ...activePeople() },
        select: {
          userId: true,
          inviterId: true,
          status: true,
          expiresAt: true,
        },
        orderBy: [{ acceptedAt: "asc" }, { id: "asc" }],
      });
      const profiles = await tx.user.findMany({
        where: {
          id: {
            in: [
              reservation.userId,
              ...participants.flatMap((person) => [
                person.userId,
                ...(person.inviterId ? [person.inviterId] : []),
              ]),
            ],
          },
        },
        select: profile,
      });
      const byId = new Map(profiles.map((person) => [person.id, person]));
      const group = {
        ...reservation,
        user: byId.get(reservation.userId)!,
        participants: participants.map((person) => ({
          ...person,
          user: byId.get(person.userId)!,
          inviter: person.inviterId
            ? (byId.get(person.inviterId) ?? null)
            : null,
        })),
      };
      const own = group.participants.find((p) => p.userId === userId);
      const organizer = group.userId === userId;
      const pending = !organizer && own?.status === "PENDING";
      const accepted = group.participants.filter(
        (p) => p.status === "ACCEPTED",
      );
      const occupied = group.participants.length + 1;
      const favorites =
        organizer &&
        group.wish.wishlist.reservationsEnabled &&
        occupied < GROUP_LIMIT
          ? await tx.favoritePerson.findMany({
              where: {
                userId,
                person: {
                  ...publicOwners,
                  ...availableGroupRecipients(
                    userId,
                    reservationId,
                    group.wish.wishlistId,
                    group.wish.wishlist.visibility,
                  ),
                },
              },
              select: { person: { select: profile } },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 12,
            })
          : [];
      return {
        favorites: favorites.map(({ person }) => person),
        id: group.id,
        wish: group.wish,
        organizer,
        pending,
        size: accepted.length + 1,
        occupied,
        // Pending recipients see only the inviter, never the accepted roster.
        inviter:
          pending && own?.inviter
            ? { name: own.inviter.name, username: own.inviter.username }
            : null,
        expiresAt: pending ? own?.expiresAt : null,
        people: pending
          ? []
          : [
              { ...group.user, organizer: true },
              ...accepted.map((p) => ({ ...p.user, organizer: false })),
            ],
        invitations: organizer
          ? group.participants
              .filter((p) => p.status === "PENDING")
              .map((p) => ({ ...p.user, expiresAt: p.expiresAt }))
          : [],
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
};

export const readGroupInvitations = async (
  userId: string,
  requestedPage = 1,
) => {
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, maxPage)
      : 1;
  const where = {
    userId,
    user: { emailVerified: true },
    status: "PENDING",
    expiresAt: { gt: new Date() },
    reservation: {
      endedAt: null,
      groupEnabled: true,
      wish: accessibleWish(userId),
    },
  } satisfies Prisma.ReservationParticipantWhereInput;
  const rows = await prisma.reservationParticipant.findMany({
    where,
    select: {
      id: true,
      reservationId: true,
      expiresAt: true,
      inviter: { select: { username: true, name: true } },
      reservation: { select: { wish: { select: { title: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  });
  return {
    invitations: rows.slice(0, pageSize),
    page,
    totalPages: await readPageCount(page, rows.length, maxPage, (take) =>
      prisma.reservationParticipant.count({ where, take }),
    ),
    hasNextPage: rows.length > pageSize && page < maxPage,
  };
};
