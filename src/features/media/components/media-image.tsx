import Image from "next/image";
import type { MediaImage as ImageDetails } from "../types";
import { DETAIL_IMAGE_SIZES } from "../variants";
import styles from "./media.module.css";

export function MediaImage({
  image,
  compact = false,
  cover = false,
  guestListId,
  priority = false,
  sizes = DETAIL_IMAGE_SIZES,
}: {
  image: ImageDetails | null;
  compact?: boolean;
  cover?: boolean;
  guestListId?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image) {
    return null;
  }

  const src = guestListId
    ? `/guest/lists/${encodeURIComponent(guestListId)}/media/${image.id}`
    : `/api/media/${image.id}`;
  const widths = image.variantWidths ?? [];
  const srcSet = widths.length
    ? [
        ...widths.map((width) => `${src}?w=${width} ${width}w`),
        `${src} ${image.width}w`,
      ].join(", ")
    : undefined;

  return (
    <picture className={cover ? styles.cover : styles.picture}>
      {srcSet && <source type="image/webp" srcSet={srcSet} sizes={sizes} />}
      <Image
        className={compact ? styles.thumbnail : styles.image}
        src={src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={priority ? "eager" : undefined}
        fetchPriority={priority ? "high" : undefined}
        unoptimized
      />
    </picture>
  );
}
