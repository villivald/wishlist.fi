import {
  CircleCheck,
  ExternalLink,
  Eye,
  EyeOff,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailNavigation } from "@/app/_navigation/navigation-context";
import {
  detailSection,
  navigationPath,
} from "@/app/_navigation/navigation-path";
import { BackLink } from "@/components/back-link";
import { CardMedia } from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { WishStatus } from "@/components/cards/wish-status";
import { wishTone } from "@/components/cards/wish-tones";
import { ActionForm } from "@/components/form/action-form";
import { SuccessMessage } from "@/components/form/success-message";
import styles from "@/components/shell.module.css";
import { getAuth } from "@/features/auth/actions/get-auth";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import { readFavoriteIds } from "@/features/favorites/service/favorites";
import { MediaImage } from "@/features/media/components/media-image";
import { ReservationControls } from "@/features/reservation/components/reservation-controls";
import { changeWishState } from "@/features/wish/actions/manage-wish";
import { WishPriority } from "@/features/wish/components/wish-priority";
import { readWish } from "@/features/wish/service/wishes";
import { formatWishPrice } from "@/features/wish/utils/money";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { listPath, wishPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Wish"),
    robots: { index: false, follow: false },
  };
}

export default async function WishPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string; wishId: string }>;
  searchParams: Promise<{ created?: string; saved?: string; from?: string }>;
}) {
  const t = await getText();

  const { user } = await getAuth();
  const { listId, wishId } = await params;
  const wish = await readWish(listId, wishId, user?.id ?? null);

  if (!wish) {
    notFound();
  }

  const { created, saved, from } = await searchParams;
  const section = detailSection(from, wish.canManage);
  const favoriteIds = await readFavoriteIds(
    user?.emailVerified ? user.id : null,
    "wish",
    [wish.id],
  );

  return (
    <section className={styles.page}>
      <DetailNavigation section={section} />
      <BackLink href={navigationPath(listPath(listId), section)}>
        {t("Back to")} {wish.wishlist.title}
      </BackLink>

      {wish.canManage && (created === "1" || saved === "1") && (
        <SuccessMessage queryKeys={["created", "saved"]}>
          {created === "1" ? t("Wish added.") : t("Changes saved.")}
        </SuccessMessage>
      )}

      <div
        className={`${styles["wish-detail"]} ${cardStyles.tone}`}
        data-wish-tone={wishTone(wish.id)}
      >
        <div className={styles["detail-image"]}>
          {wish.image ? (
            <MediaImage image={wish.image} priority />
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
            {(user?.emailVerified || wish.canManage) && (
              <div className={styles.actions}>
                {user?.emailVerified && (
                  <FavoriteButton
                    kind="wish"
                    targetId={wish.id}
                    saved={favoriteIds.includes(wish.id)}
                    title={wish.title}
                  />
                )}
                {wish.canManage && (
                  <Link
                    className={styles.button}
                    href={`${wishPath(listId, wishId)}/edit`}
                  >
                    {t("Edit wish")}
                  </Link>
                )}
              </div>
            )}
          </div>

          {(wish.hidden || wish.fulfilledAt || wish.isReserved) && (
            <WishStatus
              hidden={wish.hidden}
              fulfilled={!!wish.fulfilledAt}
              reserved={wish.isReserved}
              reservedByYou={wish.isReservedByYou}
            />
          )}
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
              className={styles["icon-label"]}
            >
              {t("View product (opens in a new tab)")}
              <ExternalLink size={18} aria-hidden="true" />
            </a>
          )}

          <ReservationControls wish={wish} user={user} />
        </div>
      </div>

      {wish.canManage && (
        <section
          aria-labelledby="manage-wish-heading"
          className={styles["list-settings"]}
        >
          <h2 id="manage-wish-heading">{t("Manage wish")}</h2>
          <p className={styles.muted}>
            {t(
              "Hidden and fulfilled wishes are only visible to list admins. Hiding or fulfilling a wish ends its active reservation.",
            )}
          </p>

          <div className={styles["wish-controls"]}>
            <ActionForm
              action={changeWishState.bind(null, listId, wishId)}
              label={wish.hidden ? t("Show wish") : t("Hide wish")}
              pendingLabel={t("Updating…")}
              icon={
                wish.hidden ? (
                  <Eye size={18} aria-hidden="true" />
                ) : (
                  <EyeOff size={18} aria-hidden="true" />
                )
              }
            >
              <input
                type="hidden"
                name="transition"
                value={wish.hidden ? "unhide" : "hide"}
              />
            </ActionForm>
            <ActionForm
              action={changeWishState.bind(null, listId, wishId)}
              label={
                wish.fulfilledAt ? t("Reopen wish") : t("Mark as fulfilled")
              }
              pendingLabel={t("Updating…")}
              icon={
                wish.fulfilledAt ? (
                  <RotateCcw size={18} aria-hidden="true" />
                ) : (
                  <CircleCheck size={18} aria-hidden="true" />
                )
              }
            >
              <input
                type="hidden"
                name="transition"
                value={wish.fulfilledAt ? "reopen" : "fulfill"}
              />
            </ActionForm>
          </div>

          <Link
            className={styles["icon-label"]}
            href={`${wishPath(listId, wishId)}/delete`}
          >
            <Trash2 size={18} aria-hidden="true" /> {t("Delete wish")}
          </Link>
        </section>
      )}
    </section>
  );
}
