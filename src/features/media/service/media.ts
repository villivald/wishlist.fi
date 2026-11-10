import { cache } from "react";
import { consumeRateLimit, lockUser } from "@/features/auth/service/security";
import { publicOwners } from "@/features/discovery/service/access";
import { readableWishes } from "@/features/wish/service/access";
import { readableLists } from "@/features/wishlist/service/access";
import { lockManagedWishlist } from "@/features/wishlist/service/lists";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { imageSelection, MediaError, type MediaTarget } from "../types";
import { storageProvider } from "./storage";
import {
  imageDescriptionSchema,
  mediaTargetSchema,
  prepareImage,
  prepareImageVariants,
} from "./validation";
import { storePreparedImage } from "./variants";

const targetFields = (target: MediaTarget, userId: string) =>
  target.kind === "avatar"
    ? { userId }
    : target.kind === "list"
      ? { wishlistId: target.listId }
      : { wishId: target.wishId };

const lockTarget = async (
  tx: Prisma.TransactionClient,
  target: MediaTarget,
  userId: string,
) => {
  if (target.kind === "avatar") {
    await lockUser(tx, userId);
    const user = await tx.user.findFirst({
      where: { id: userId, emailVerified: true },
      select: { id: true },
    });

    if (!user) {
      throw new MediaError("This account is unavailable.");
    }
    return;
  }

  await lockManagedWishlist(tx, target.listId, userId);

  if (
    target.kind === "wish" &&
    !(await tx.wish.findFirst({
      where: { id: target.wishId, wishlistId: target.listId },
      select: { id: true },
    }))
  ) {
    throw new MediaError("This wish is unavailable.");
  }
};

export const authorizeImageChange = async (userId: string, input: unknown) => {
  const target = mediaTargetSchema.parse(input);
  await prisma.$transaction((tx) => lockTarget(tx, target, userId));
  return target;
};

export const stageImage = async (
  userId: string,
  input: unknown,
  altInput: unknown,
  bytes: Buffer,
) => {
  const target = await authorizeImageChange(userId, input);
  const alt = imageDescriptionSchema.parse(altInput);
  await consumeRateLimit("image-upload", userId, 30, 60 * 60 * 1000);

  const { data, ...dimensions } = await prepareImage(
    bytes,
    target.kind === "avatar",
  );
  const variants = await prepareImageVariants(
    data,
    dimensions,
    target.kind === "avatar",
  );
  const pending = await storePreparedImage({
    data,
    variants,
    alt,
    ...dimensions,
    provider: storageProvider(),
  });
  return pending.id;
};

export const attachStagedImage = async (
  tx: Prisma.TransactionClient,
  userId: string,
  target: MediaTarget,
  imageId: string,
) => {
  // Recheck after storage I/O: membership or the target may have changed.
  await lockTarget(tx, target, userId);
  const fields = targetFields(target, userId);

  await tx.media.updateMany({
    where: fields,
    data: {
      userId: null,
      wishlistId: null,
      wishId: null,
      cleanupAfter: new Date(),
    },
  });
  const attached = await tx.media.updateMany({
    where: {
      id: imageId,
      state: "PENDING",
      cleanupAfter: { gt: new Date() },
    },
    data: { ...fields, state: "READY" },
  });

  if (attached.count !== 1) {
    throw new MediaError("The upload expired. Please try again.");
  }

  return tx.media.findUniqueOrThrow({
    where: { id: imageId },
    ...imageSelection,
  });
};

export const replaceImage = async (
  userId: string,
  input: unknown,
  altInput: unknown,
  bytes: Buffer,
) => {
  const target = mediaTargetSchema.parse(input);
  const imageId = await stageImage(userId, target, altInput, bytes);

  return prisma.$transaction((tx) =>
    attachStagedImage(tx, userId, target, imageId),
  );
};

export const removeImage = async (userId: string, input: unknown) => {
  const target = mediaTargetSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    await lockTarget(tx, target, userId);
    await tx.media.updateMany({
      where: targetFields(target, userId),
      data: {
        userId: null,
        wishlistId: null,
        wishId: null,
        cleanupAfter: new Date(),
      },
    });
  });
};

export const readableImage = (id: string, userId: string | null) =>
  prisma.media.findFirst({
    where: {
      id,
      state: "READY",
      OR: [
        { user: publicOwners },
        { wishlist: readableLists(userId) },
        { wish: readableWishes(userId, true) },
        ...(userId ? [{ userId, user: { emailVerified: true } }] : []),
      ],
    },
    select: { id: true, pathname: true, provider: true, variantWidths: true },
  });

export const readAvatar = cache((userId: string) =>
  prisma.media.findFirst({
    where: { userId, state: "READY", user: { emailVerified: true } },
    ...imageSelection,
  }),
);
