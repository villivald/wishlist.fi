import { lockUser } from "@/features/auth/service/security";
import { stageImageCopies } from "@/features/media/service/copy-image";
import { attachStagedImage } from "@/features/media/service/media";
import { listAccess } from "@/features/wishlist/list-access";
import { manageableLists } from "@/features/wishlist/service/access";
import { lockWishlist } from "@/features/wishlist/service/lock";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/utils/crypto";
import {
  wishDestination,
  type WishTransferOperation,
  wishTransferOperation,
} from "../transfer";
import { readableWishes } from "./access";
import { WishError } from "./wishes";

const destinationAccess = (
  userId: string,
  operation: WishTransferOperation,
) => ({
  ...manageableLists(userId),
  ...(operation === "copy" ? { ownerId: userId } : {}),
});

export const readWishDestinations = (
  userId: string,
  sourceListId: string,
  operation: WishTransferOperation,
) =>
  prisma.wishlist.findMany({
    where: {
      id: { not: sourceListId },
      ...destinationAccess(userId, operation),
    },
    select: {
      id: true,
      title: true,
      visibility: true,
      publication: true,
      owner: { select: { username: true } },
    },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  });

export const reservedMoveMessage =
  "This wish has an active reservation. End the reservation before moving it.";

const unavailableSource =
  "This wish is unavailable or you do not have permission to transfer it.";

const unavailableDestination =
  "You can no longer use this destination list. Reload the page and choose a list.";

export const transferWishes = async (
  userId: string,
  sourceListId: string,
  wishId: string,
  operation: WishTransferOperation,
  destinations: unknown[],
  requestId?: string,
) => {
  wishlistIdSchema.parse(sourceListId);
  wishlistIdSchema.parse(wishId);
  wishTransferOperation.parse(operation);
  if (
    !destinations.length ||
    (operation === "move" && destinations.length !== 1)
  ) {
    throw new WishError(
      operation === "move"
        ? "Choose one destination list."
        : "Choose at least one destination list.",
    );
  }
  const targets = destinations.map((destination) => {
    const parsed = wishDestination.safeParse(destination);
    if (!parsed.success || parsed.data[0] === sourceListId)
      throw new WishError("Choose a different destination list.");
    const [destinationId, access] = parsed.data;
    const key = [userId, wishId, sourceListId, destinationId, requestId];
    return {
      destinationId,
      access,
      id:
        operation === "move"
          ? wishId
          : `copy_${hashToken(JSON.stringify(key))}`,
    };
  });
  if (operation === "copy") wishlistIdSchema.parse(requestId);
  const ids = targets.map((target) => target.destinationId);
  if (new Set(ids).size !== ids.length)
    throw new WishError("Choose each destination only once.");
  const sourceWhere = {
    id: wishId,
    wishlistId: sourceListId,
    ...(operation === "move"
      ? { wishlist: manageableLists(userId) }
      : readableWishes(userId, true)),
  };
  const verifyDestinations = async (db: Prisma.TransactionClient) => {
    const lists = await db.wishlist.findMany({
      where: { id: { in: ids }, ...destinationAccess(userId, operation) },
      select: { id: true, publication: true, visibility: true },
    });
    if (lists.length !== targets.length)
      throw new WishError(unavailableDestination);
    const audiences = new Map(lists.map((list) => [list.id, listAccess(list)]));
    if (
      targets.some(
        (target) => audiences.get(target.destinationId) !== target.access,
      )
    ) {
      throw new WishError(
        "Who can view the destination list has changed. Reload the page to review it.",
      );
    }
  };

  const existingCopies = async (db: Prisma.TransactionClient) => {
    const copies = await db.wish.findMany({
      where: {
        id: { in: targets.map((target) => target.id) },
        authorId: userId,
      },
      select: { id: true, wishlistId: true },
    });
    return new Map(copies.map((copy) => [copy.id, copy.wishlistId]));
  };
  let originalImageId: string | undefined;
  let stagedImages = new Map<string, string>();
  if (operation === "copy") {
    const [source, existing] = await Promise.all([
      prisma.wish.findFirst({ where: sourceWhere, select: { image: true } }),
      existingCopies(prisma),
      verifyDestinations(prisma),
    ]);
    if (!source) throw new WishError(unavailableSource);
    if (source.image?.state === "READY") {
      originalImageId = source.image.id;
      // Storage writes run outside the transaction. Detached images expire on failure.
      const missing = targets.filter((target) => !existing.has(target.id));
      stagedImages = await stageImageCopies(
        userId,
        source.image,
        missing.map((target) => target.id),
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    for (const listId of [sourceListId, ...ids].sort())
      await lockWishlist(tx, listId);
    const source = await tx.wish.findFirst({
      where: sourceWhere,
      select: {
        title: true,
        description: true,
        externalUrl: true,
        priceMinor: true,
        currency: true,
        priority: true,
        hidden: true,
        fulfilledAt: true,
        image: { where: { state: "READY" }, select: { id: true } },
        reservations: {
          where: { endedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!source) throw new WishError(unavailableSource);
    await verifyDestinations(tx);
    const { image, reservations, ...details } = source;

    if (operation === "move") {
      if (reservations.length) throw new WishError(reservedMoveMessage);
      await tx.wish.update({
        where: { id: wishId },
        data: { wishlistId: targets[0]!.destinationId },
        select: { id: true },
      });
      return;
    }

    const existing = await existingCopies(tx);
    for (const { id, destinationId } of targets) {
      if (existing.get(id) === destinationId) continue;
      const stagedImageId = stagedImages.get(id);
      if (image?.id !== originalImageId || (image && !stagedImageId)) {
        throw new WishError(
          "The wish image changed. Reload the page and try again.",
        );
      }
      await tx.wish.create({
        data: { ...details, id, wishlistId: destinationId, authorId: userId },
      });
      if (stagedImageId) {
        await attachStagedImage(
          tx,
          userId,
          { kind: "wish", listId: destinationId, wishId: id },
          stagedImageId,
        );
      }
    }
  });
  return targets.map(({ id, destinationId }) => ({ id, destinationId }));
};
