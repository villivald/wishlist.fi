import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CardMedia } from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { wishTone } from "@/components/cards/wish-tones";
import styles from "@/components/shell.module.css";
import { GUEST_COOKIE } from "@/features/guest/http";
import { readGuestWish } from "@/features/guest/service/access";
import { MediaImage } from "@/features/media/components/media-image";
import { WishPriority } from "@/features/wish/components/wish-priority";
import { formatWishPrice } from "@/features/wish/utils/money";
import { localizedPath } from "@/i18n/config";
import { getText } from "@/i18n/server";
import { guestListPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Shared wish"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function GuestWishPage({
  params,
}: {
  params: Promise<{ listId: string; wishId: string }>;
}) {
  const t = await getText();

  const { listId, wishId } = await params;
  const wish = await readGuestWish(
    listId,
    wishId,
    (await cookies()).get(GUEST_COOKIE)?.value,
  );
  if (!wish) notFound();
  return (
    <section className={styles.page}>
      <a
        className={styles["back-link"]}
        href={localizedPath(guestListPath(listId), t.locale)}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        <span>{t("Back to shared list")}</span>
      </a>
      <p className={styles.notice}>{t("Guest view · Read only")}</p>
      <div
        className={`${styles["wish-detail"]} ${cardStyles.tone}`}
        data-wish-tone={wishTone(wish.id)}
      >
        <div className={styles["detail-image"]}>
          {wish.image ? (
            <MediaImage image={wish.image} guestListId={listId} priority />
          ) : (
            <CardMedia image={null} title={wish.title} />
          )}
        </div>
        <div className={styles["wish-copy"]}>
          <div className={styles["wish-heading"]}>
            <h1>{wish.title}</h1>
            <div className={styles["wish-facts"]}>
              <p className={styles.price}>
                {formatWishPrice(wish.priceMinor, wish.currency, t)}
              </p>
              <WishPriority priority={wish.priority} />
            </div>
          </div>
          {wish.description && (
            <div className={styles["wish-note"]}>
              <p className={styles.eyebrow}>{t("About this wish")}</p>
              <p className={styles.description}>{wish.description}</p>
            </div>
          )}
          {wish.externalUrl && (
            <a
              href={wish.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className={styles["icon-label"]}
            >
              {t("View product (opens in a new tab)")}
              <ExternalLink size={18} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <p>
        {t(
          "This link does not allow editing, joining, or reserving. Any independent access you have through your account remains available in the normal app.",
        )}
      </p>
    </section>
  );
}
