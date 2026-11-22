import { UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { MediaImage } from "@/features/media/components/media-image";
import type { MediaImage as ImageDetails } from "@/features/media/types";
import { CARD_IMAGE_SIZES, STACK_IMAGE_SIZES } from "@/features/media/variants";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import styles from "./cards.module.css";

export function CardMediaLink({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: ReactNode;
}) {
  const t = useText();
  return (
    <Link
      href={path}
      className={styles["media-link"]}
      aria-label={t("Open {value0} from preview", { value0: title })}
    >
      {children}
    </Link>
  );
}

export function CardMedia({
  image,
  kind = "wish",
  guestListId,
  title,
}: {
  image: ImageDetails | null;
  kind?: "wish" | "list";
  guestListId?: string;
  title?: string;
}) {
  const t = useText();

  return (
    <div
      className={
        kind === "list"
          ? `${styles.media} ${styles["list-cover"]}`
          : styles.media
      }
    >
      {image ? (
        <MediaImage
          image={image}
          compact
          guestListId={guestListId}
          sizes={CARD_IMAGE_SIZES}
        />
      ) : (
        <div className={styles.placeholder} aria-hidden="true">
          <span className={styles["placeholder-title"]}>
            {title ?? (kind === "wish" ? t("Wish") : t("List"))}
          </span>
        </div>
      )}
    </div>
  );
}

export function ListPreview({
  image,
  images,
  title,
}: {
  image: ImageDetails | null;
  images: ImageDetails[];
  title?: string;
}) {
  const t = useText();

  if (image || !images.length)
    return <CardMedia image={image} kind="list" title={title} />;

  return (
    <div
      className={`${styles.stack} ${styles["list-cover"]}`}
      aria-label={t("Preview of available wishes")}
    >
      {images.map((preview) => (
        <div key={preview.id} className={styles["stack-image"]}>
          <MediaImage image={preview} compact sizes={STACK_IMAGE_SIZES} />
        </div>
      ))}
    </div>
  );
}

export function UserAvatar({
  image,
  compact = false,
}: {
  image: ImageDetails | null;
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.avatar} ${compact ? styles["compact-avatar"] : ""}`}
    >
      {image ? (
        <MediaImage image={image} compact sizes={compact ? "32px" : "64px"} />
      ) : (
        <UserRound aria-hidden="true" />
      )}
    </div>
  );
}
