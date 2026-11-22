import { Search } from "lucide-react";
import type { Metadata } from "next";
import styles from "@/components/shell.module.css";
import { getAuth } from "@/features/auth/actions/get-auth";
import { BrowseControls } from "@/features/discovery/components/discovery-controls";
import {
  DiscoveryListResults,
  DiscoveryResults,
} from "@/features/discovery/components/discovery-results";
import {
  discoverLists,
  discoverUsers,
  discoverWishes,
} from "@/features/discovery/service/discovery";
import {
  type DiscoveryQuery,
  discoveryUrl,
  parseDiscoveryQuery,
} from "@/features/discovery/service/query";
import { readFavoriteIds } from "@/features/favorites/service/favorites";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import browseStyles from "./browse.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Browse wishlists"),
    robots: { index: false, follow: false },
  };
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<DiscoveryQuery>;
}) {
  const t = await getText();

  const query = await searchParams;
  const { user } = await getAuth();
  const view = parseDiscoveryQuery(query).view;
  const result =
    view === "users"
      ? await discoverUsers(query, user?.id)
      : view === "wishes"
        ? await discoverWishes(query, user?.id)
        : await discoverLists(query, user?.id);
  const { filters, hasNextPage } = result;
  const curatedLists = "curatedLists" in result ? result.curatedLists : [];
  const canFavorite = !!user?.emailVerified;
  const favoriteIds = await readFavoriteIds(
    user?.emailVerified ? user.id : null,
    "lists" in result ? "list" : "wishes" in result ? "wish" : "person",
    "lists" in result
      ? [...result.lists, ...curatedLists].map(({ id }) => id)
      : "wishes" in result
        ? result.wishes.map(({ id }) => id)
        : result.users.map(({ username }) => username),
  );
  const empty =
    "lists" in result
      ? !result.lists.length
      : "wishes" in result
        ? !result.wishes.length
        : !result.users.length;

  return (
    <section className={styles.page}>
      <BrowseControls filters={filters} />
      {curatedLists.length > 0 && (
        <section
          className={browseStyles.curated}
          aria-labelledby="wishlist-inspiration"
        >
          <div>
            <p className={styles.eyebrow}>{t("Curated by Wishlist")}</p>
            <h2 id="wishlist-inspiration">{t("Wishlist inspiration")}</h2>
          </div>
          <DiscoveryListResults
            lists={curatedLists}
            canFavorite={canFavorite}
            favoriteIds={favoriteIds}
            curated
          />
        </section>
      )}
      {filters.error ? (
        <p role="alert" className={styles.error}>
          {t.message(filters.error)}
        </p>
      ) : empty && !curatedLists.length ? (
        <div className={styles["empty-state"]}>
          <Search aria-hidden="true" />
          <h2>
            {filters.page > 1 ? t("No more results") : t("No results found")}
          </h2>
          <p className={styles.muted}>
            {filters.view === "users"
              ? t(
                  "Try another name or username. Only people with a list visible to anyone appear here.",
                )
              : t(
                  "Try different filters or check back for new public {value0}.",
                  {
                    value0: filters.view === "lists" ? t("lists") : t("wishes"),
                  },
                )}
          </p>
        </div>
      ) : empty ? null : (
        <DiscoveryResults
          result={result}
          canFavorite={canFavorite}
          favoriteIds={favoriteIds}
        />
      )}
      {!filters.error && (filters.page > 1 || hasNextPage) && (
        <nav className={styles.actions} aria-label={t("Browse pages")}>
          {filters.page > 1 && (
            <Link href={discoveryUrl(filters, filters.page - 1)}>
              {t("Previous page")}
            </Link>
          )}
          <span>
            {t("Page")} {filters.page}
          </span>
          {hasNextPage && (
            <Link href={discoveryUrl(filters, filters.page + 1)}>
              {t("Next page")}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
