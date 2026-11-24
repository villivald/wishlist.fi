import { randomUUID } from "node:crypto";
import type { MediaProvider } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { IMAGE_VARIANT_VERSION, imageVariantPath } from "../variants";
import { mediaStorage } from "./storage";

export const storePreparedImage = async (image: {
  data: Buffer;
  variants: { data: Buffer; width: number }[];
  provider: MediaProvider;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  variantVersion?: number;
}) => {
  // Record every intended path before any external write, including partial failures.
  const pending = await prisma.media.create({
    data: {
      pathname: `images/${randomUUID()}.webp`,
      provider: image.provider,
      alt: image.alt,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      variantWidths: image.variants.map(({ width }) => width),
      variantVersion: image.variantVersion ?? IMAGE_VARIANT_VERSION,
      cleanupAfter: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const files = [
    { pathname: pending.pathname, data: image.data },
    ...image.variants.map(({ data, width }) => ({
      pathname: imageVariantPath(pending.pathname, width),
      data,
    })),
  ];
  const results = await Promise.allSettled(
    files.map(({ pathname, data }) =>
      mediaStorage.put(pending.provider, pathname, data),
    ),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return pending;
};

export const readImageVariant = (
  media: {
    pathname: string;
    provider: MediaProvider;
    variantWidths: number[];
  },
  width: number | null,
) =>
  mediaStorage.get(
    media.provider,
    width !== null && media.variantWidths.includes(width)
      ? imageVariantPath(media.pathname, width)
      : media.pathname,
  );
