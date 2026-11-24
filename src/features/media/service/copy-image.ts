import { buffer } from "node:stream/consumers";
import { consumeRateLimit } from "@/features/auth/service/security";
import type { Media } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MediaError } from "../types";
import { storageProvider } from "./storage";
import { readImageVariant, storePreparedImage } from "./variants";

export const stageImageCopies = async (
  userId: string,
  image: Media,
  targetIds: string[],
) => {
  const staged = new Map<string, string>();
  if (!targetIds.length) return staged;
  // Reserve the existing per-image allowance before doing any storage I/O.
  await prisma.$transaction(async (tx) => {
    for (const _id of targetIds)
      await consumeRateLimit("image-upload", userId, 30, 60 * 60 * 1000, tx);
  });

  const read = async (width: number | null) => {
    const bytes = await readImageVariant(image, width);
    if (!bytes) {
      throw new MediaError("The wish image could not be copied. Try again.");
    }
    return bytes instanceof Uint8Array ? Buffer.from(bytes) : buffer(bytes);
  };

  const [data, variants] = await Promise.all([
    read(null),
    Promise.all(
      image.variantWidths.map(async (width) => ({
        width,
        data: await read(width),
      })),
    ),
  ]);

  const prepared = {
    data,
    variants,
    provider: storageProvider(),
    alt: image.alt,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    variantVersion: image.variantVersion,
  };
  for (const targetId of targetIds) {
    const copy = await storePreparedImage(prepared);
    staged.set(targetId, copy.id);
  }
  return staged;
};
