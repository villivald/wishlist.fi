import { Sparkles } from "lucide-react";
import {
  type DetailSection,
  navigationPath,
} from "@/app/_navigation/navigation-path";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { CardActions } from "@/components/cards/card-actions";
import { CardMedia, CardMediaLink } from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { WishCard } from "@/components/cards/wish-card";
import { WishStatus } from "@/components/cards/wish-status";
import { createWishTones } from "@/components/cards/wish-tones";
import styles from "@/components/shell.module.css";
import { readFavoriteIds } from "@/features/favorites/service/favorites";
import { localizedPath } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { listPath, newWishPath, wishPath } from "@/paths";
import { readListWishes } from "../service/wishes";
import { formatWishPrice } from "../utils/money";
import { WishPriority } from "./wish-priority";

export async function WishCollection({
  listId,
  userId,
  canManage,
  section,
  reservationsEnabled,
  searchParams,
}: {
  listId: string;
  userId: string | null;
  canManage: boolean;
  section: DetailSection;
  reservationsEnabled: boolean;
  searchParams: {
    sort?: string;
    view?: string;
    page?: string;
    reserved?: string;
  };
}) {
  const t = await getText();
  const reservedOnly = searchParams.reserved === "1";

  const { wishes, sort, view, page, hasNextPage } = await readListWishes(
    listId,
    userId,
    {
      sort: searchParams.sort,
      reserved: reservedOnly,
      view: canManage ? searchParams.view : "current",
      page: Number(searchParams.page ?? 1),
    },
  );

  const pageUrl = (nextPage: number) =>
    navigationPath(
      `${listPath(listId)}?${new URLSearchParams({ sort, view, ...(reservedOnly ? { reserved: "1" } : {}), page: String(nextPage) })}`,
      section,
    );
  const tones = createWishTones(wishes.map((wish) => wish.id));
  const favoriteIds = await readFavoriteIds(
    userId,
    "wish",
    wishes.map(({ id }) => id),
  );

  return (
    <section className={styles.page} aria-labelledby="wishes-heading">
      <div className={styles["page-heading"]}>
        <h2 id="wishes-heading">
          {view === "fulfilled" ? t("Fulfilled wishes") : t("Wishes")}
        </h2>
        {canManage && (
          <Link href={newWishPath(listId)} className={styles.button}>
            {t("Add a wish")}
          </Link>
        )}
      </div>

      <AutoFilterForm
        action={localizedPath(listPath(listId), t.locale)}
        className={styles["wish-toolbar"]}
        label={t("Wishes")}
      >
        <input type="hidden" name="from" value={section} />
        <div className={styles.field}>
          <label htmlFor="wish-sort">{t("Sort wishes")}</label>
          <select id="wish-sort" name="sort" defaultValue={sort}>
            <option value="newest">{t("Newest first")}</option>
            <option value="oldest">{t("Oldest first")}</option>
            <option value="priority">{t("Highest priority")}</option>
            <option value="title">{t("Title A–Z")}</option>
          </select>
        </div>
        {canManage && (
          <div className={styles.field}>
            <label htmlFor="wish-view">{t("Show")}</label>
            <select id="wish-view" name="view" defaultValue={view}>
              <option value="current">{t("Current wishes")}</option>
              <option value="fulfilled">{t("Fulfilled history")}</option>
            </select>
          </div>
        )}
        <label className={styles["checkbox-label"]}>
          <input
            type="checkbox"
            role="switch"
            name="reserved"
            value="1"
            defaultChecked={reservedOnly}
          />
          {t("Only reserved wishes")}
        </label>
      </AutoFilterForm>

      {wishes.length ? (
        <ul className={styles["list-grid"]}>
          {wishes.map((wish) => (
            <WishCard
              key={wish.id}
              tone={tones[wish.id]}
              reserved={wish.isReserved}
            >
              <CardMediaLink
                path={navigationPath(wishPath(listId, wish.id), section)}
                title={wish.title}
              >
                <CardMedia image={wish.image} title={wish.title} />
              </CardMediaLink>
              <h3 className={styles["wish-title"]}>
                <Link href={navigationPath(wishPath(listId, wish.id), section)}>
                  {wish.title}
                </Link>
              </h3>
              <div className={cardStyles["wish-facts"]}>
                <p className={styles.price}>
                  {formatWishPrice(wish.priceMinor, wish.currency, t)}
                </p>
                <WishPriority priority={wish.priority} />
              </div>
              {(canManage || wish.isReserved) && (
                <WishStatus
                  hidden={wish.hidden}
                  fulfilled={!!wish.fulfilledAt}
                  reserved={wish.isReserved}
                  reservedByYou={wish.isReservedByYou}
                  showVisible={canManage}
                />
              )}
              <CardActions
                path={wishPath(listId, wish.id)}
                title={wish.title}
                section={section}
                favorite={
                  userId
                    ? {
                        kind: "wish",
                        targetId: wish.id,
                        saved: favoriteIds.includes(wish.id),
                      }
                    : undefined
                }
                productUrl={wish.externalUrl}
                canReserve={
                  reservationsEnabled &&
                  !wish.hidden &&
                  !wish.fulfilledAt &&
                  !wish.isReserved
                }
                canManage={canManage}
              />
            </WishCard>
          ))}
        </ul>
      ) : (
        <div className={styles["empty-state"]}>
          <Sparkles aria-hidden="true" />
          <h3>
            {reservedOnly
              ? t("No reserved wishes")
              : page > 1
                ? t("No more wishes")
                : view === "fulfilled"
                  ? t("No fulfilled wishes yet")
                  : canManage
                    ? t("No wishes yet")
                    : t("No wishes available")}
          </h3>
          <p className={styles.muted}>
            {reservedOnly
              ? t("Turn off the filter to see other wishes.")
              : page > 1
                ? t("Return to an earlier page.")
                : view === "fulfilled"
                  ? t("Wishes you mark as fulfilled will appear here.")
                  : canManage
                    ? t("Start with just a title. You can add details later.")
                    : t("Check back for new wishes.")}
          </p>
        </div>
      )}

      {(page > 1 || hasNextPage) && (
        <nav aria-label={t("Wish pages")} className={styles.actions}>
          {page > 1 && (
            <Link href={pageUrl(page - 1)}>{t("Previous page")}</Link>
          )}
          <span>
            {t("Page")} {page}
          </span>
          {hasNextPage && (
            <Link href={pageUrl(page + 1)}>{t("Next page")}</Link>
          )}
        </nav>
      )}
    </section>
  );
}
