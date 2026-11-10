import { Gift, Heart, List, Users } from "lucide-react";
import type { Metadata } from "next";
import shell from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import styles from "@/features/favorites/components/favorites.module.css";
import { FavoritesResults } from "@/features/favorites/components/favorites-results";
import {
  readFavoriteCounts,
  readFavorites,
} from "@/features/favorites/service/favorites";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { favoritesPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return { title: t("Favorites"), robots: { index: false, follow: false } };
}

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const t = await getText();
  const { user } = await getAuthOrRedirect({ returnTo: favoritesPath });
  const query = await searchParams;
  const [result, counts] = await Promise.all([
    readFavorites(user.id, query),
    readFavoriteCounts(user.id),
  ]);
  const count =
    result.lists?.length ?? result.wishes?.length ?? result.people?.length ?? 0;
  const empty = count === 0;
  const pageUrl = (page: number) =>
    `${favoritesPath}?${new URLSearchParams({ view: result.view, page: String(page) })}`;
  return (
    <section className={shell.page}>
      <div className={shell["page-heading"]}>
        <div>
          <h1>{t("Favorites")}</h1>
          <p className={shell.muted}>
            {t("Keep lists, wishes, and people close at hand.")}
          </p>
        </div>
      </div>
      <p className={shell.muted}>
        {t(
          "Your favorites are private. Only items you can currently view appear here.",
        )}
      </p>
      <nav className={styles.tabs} aria-label={t("Favorite categories")}>
        <Link
          href={`${favoritesPath}?view=lists`}
          aria-current={result.view === "lists" ? "page" : undefined}
        >
          <List size={18} aria-hidden="true" />
          {t("Lists")}
          <span className={styles.count}>
            {counts.lists.toLocaleString(t.locale)}
          </span>
        </Link>
        <Link
          href={`${favoritesPath}?view=wishes`}
          aria-current={result.view === "wishes" ? "page" : undefined}
        >
          <Gift size={18} aria-hidden="true" />
          {t("Wishes")}
          <span className={styles.count}>
            {counts.wishes.toLocaleString(t.locale)}
          </span>
        </Link>
        <Link
          href={`${favoritesPath}?view=people`}
          aria-current={result.view === "people" ? "page" : undefined}
        >
          <Users size={18} aria-hidden="true" />
          {t("People")}
          <span className={styles.count}>
            {counts.people.toLocaleString(t.locale)}
          </span>
        </Link>
      </nav>
      <p role="status" className={shell["visually-hidden"]}>
        {t.plural(
          "{count} favorite on this page",
          "{count} favorites on this page",
          count,
        )}
      </p>
      {empty ? (
        <div className={shell["empty-state"]}>
          <Heart aria-hidden="true" />
          <h2>
            {result.page > 1 ? t("No more favorites") : t("No favorites yet")}
          </h2>
          <p className={shell.muted}>
            {t("Use the heart on a list, wish, or person to save it here.")}
          </p>
          <Link href="/browse" className={shell["secondary-button"]}>
            {t("Explore wishlists")}
          </Link>
        </div>
      ) : (
        <FavoritesResults result={result} />
      )}
      {(result.page > 1 || result.hasNextPage) && (
        <nav className={shell.actions} aria-label={t("Favorite pages")}>
          {result.page > 1 && (
            <Link href={pageUrl(result.page - 1)}>{t("Previous page")}</Link>
          )}
          <span>
            {t("Page")} {result.page}
          </span>
          {result.hasNextPage && (
            <Link href={pageUrl(result.page + 1)}>{t("Next page")}</Link>
          )}
        </nav>
      )}
    </section>
  );
}
