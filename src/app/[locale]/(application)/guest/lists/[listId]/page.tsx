import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CardMedia } from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { WishCard } from "@/components/cards/wish-card";
import { createWishTones } from "@/components/cards/wish-tones";
import styles from "@/components/shell.module.css";
import { GUEST_COOKIE } from "@/features/guest/http";
import {
  readGuestList,
  readGuestWishes,
} from "@/features/guest/service/access";
import { MediaImage } from "@/features/media/components/media-image";
import { ListTheme } from "@/features/premium/components/list-theme";
import { WishPriority } from "@/features/wish/components/wish-priority";
import { formatWishPrice } from "@/features/wish/utils/money";
import { localizedPath } from "@/i18n/config";
import { getText } from "@/i18n/server";
import { guestListPath, guestWishPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Shared list"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function GuestListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const t = await getText();

  const [{ listId }, cookieStore, query] = await Promise.all([
    params,
    cookies(),
    searchParams,
  ]);
  const token = cookieStore.get(GUEST_COOKIE)?.value;
  const [list, { wishes, page, hasNextPage }] = await Promise.all([
    readGuestList(listId, token),
    readGuestWishes(listId, token, query.page),
  ]);
  if (!list) notFound();
  const tones = createWishTones(wishes.map((wish) => wish.id));
  return (
    <section className={styles.page}>
      <p className={styles.notice}>
        {t(
          "Guest view · Read only. This link does not allow editing, joining, or reserving.",
        )}
      </p>
      <ListTheme theme={list.theme}>
        <div className={styles["list-identity"]}>
          <MediaImage
            image={list.image}
            cover
            sizes="144px"
            guestListId={listId}
            priority
          />
          <h1>{list.title}</h1>
        </div>
      </ListTheme>
      {list.description && (
        <p className={styles.description}>{list.description}</p>
      )}
      <h2>{t("Available wishes")}</h2>
      {wishes.length ? (
        <ul className={styles["list-grid"]}>
          {wishes.map((wish) => (
            <WishCard key={wish.id} tone={tones[wish.id]}>
              <a
                href={localizedPath(guestWishPath(listId, wish.id), t.locale)}
                className={cardStyles["media-link"]}
                aria-label={t("Open {value0} from preview", {
                  value0: wish.title,
                })}
              >
                <CardMedia
                  image={wish.image}
                  title={wish.title}
                  guestListId={listId}
                />
              </a>
              <h3>
                <a
                  href={localizedPath(guestWishPath(listId, wish.id), t.locale)}
                >
                  {wish.title}
                </a>
              </h3>
              <div className={cardStyles["wish-facts"]}>
                <p className={styles.price}>
                  {formatWishPrice(wish.priceMinor, wish.currency, t)}
                </p>
                <WishPriority priority={wish.priority} />
              </div>
            </WishCard>
          ))}
        </ul>
      ) : (
        <p>{t("No wishes available on this page.")}</p>
      )}
      {(page > 1 || hasNextPage) && (
        <nav className={styles.actions} aria-label={t("Guest wish pages")}>
          {page > 1 && (
            <a
              href={localizedPath(
                `${guestListPath(listId)}?page=${page - 1}`,
                t.locale,
              )}
            >
              {t("Previous page")}
            </a>
          )}
          <span>
            {t("Page")} {page}
          </span>
          {hasNextPage && (
            <a
              href={localizedPath(
                `${guestListPath(listId)}?page=${page + 1}`,
                t.locale,
              )}
            >
              {t("Next page")}
            </a>
          )}
        </nav>
      )}
    </section>
  );
}
