import { Settings, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailNavigation } from "@/app/_navigation/navigation-context";
import { detailSection } from "@/app/_navigation/navigation-path";
import { BackLink } from "@/components/back-link";
import { CopyLink } from "@/components/cards/copy-link";
import { ListStatus } from "@/components/cards/list-status";
import { SuccessMessage } from "@/components/form/success-message";
import styles from "@/components/shell.module.css";
import { getAuth } from "@/features/auth/actions/get-auth";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import { readFavoriteIds } from "@/features/favorites/service/favorites";
import { MediaImage } from "@/features/media/components/media-image";
import { ListTheme } from "@/features/premium/components/list-theme";
import premiumStyles from "@/features/premium/components/personalization.module.css";
import { SharingCardDownload } from "@/features/premium/components/sharing-card-download";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import { WishCollection } from "@/features/wish/components/wish-collection";
import headerStyles from "@/features/wishlist/components/list-header.module.css";
import { ListPublication } from "@/features/wishlist/components/list-publication";
import { readWishlist } from "@/features/wishlist/service/lists";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import {
  browsePath,
  favoritesPath,
  listPath,
  listSettingsPath,
  listsPath,
  reservationsPath,
  sharingPath,
} from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: "Wishlist" },
    robots: { index: false, follow: false },
  };
}

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{
    from?: string;
    created?: string;
    saved?: string;
    wishDeleted?: string;
    sort?: string;
    view?: string;
    page?: string;
    reserved?: string;
  }>;
}) {
  const t = await getText();

  const { user } = await getAuth();
  const { listId } = await params;
  const [list, favoriteIds] = await Promise.all([
    readWishlist(listId, user?.id ?? null),
    readFavoriteIds(user?.emailVerified ? user.id : null, "list", [listId]),
  ]);

  if (!list) {
    notFound();
  }

  const query = await searchParams;
  const { created, saved, wishDeleted } = query;
  const section = detailSection(query.from, list.canManage);
  const published = list.publication === "PUBLISHED";
  const premium = list.ownerId
    ? (await readPremiumAccess(list.ownerId)).plan === "PREMIUM"
    : false;

  return (
    <section className={styles.page}>
      <DetailNavigation section={section} />
      <BackLink
        href={
          section === "favorites"
            ? favoritesPath
            : section === "lists"
              ? list.owner?.username !== user?.username
                ? `${listsPath}?shared=1`
                : listsPath
              : section === "reservations"
                ? reservationsPath
                : browsePath
        }
      >
        {section === "favorites"
          ? t("Back to favorites")
          : section === "lists"
            ? t("Back to my lists")
            : section === "reservations"
              ? t("View my reservations")
              : t("Back to browse")}
      </BackLink>

      {list.canManage && (created === "1" || saved === "1") && (
        <SuccessMessage queryKeys={["created", "saved"]}>
          {created === "1" ? t("List created.") : t("Changes saved.")}
        </SuccessMessage>
      )}

      <ListTheme theme={list.theme}>
        <header
          className={`${headerStyles.header} ${list.canManage ? headerStyles.managed : ""} ${list.theme !== "classic" ? premiumStyles["themed-heading"] : ""}`}
        >
          <div
            className={`${styles["list-identity"]} ${headerStyles.identity}`}
          >
            <MediaImage image={list.image} cover sizes="144px" priority />
            <div>
              {!list.canManage && (
                <ListStatus
                  publication={list.publication}
                  visibility={list.visibility}
                />
              )}
              <h1>{list.title}</h1>
              {list.owner && (
                <p className={styles.muted}>
                  <span className={styles["visually-hidden"]}>
                    {t("List owner")}:{" "}
                  </span>
                  <span>@{list.owner.username}</span>
                </p>
              )}
            </div>
          </div>
          <div className={headerStyles.toolbar}>
            {list.canManage && <ListPublication list={list} />}
            <div className={`${styles.actions} ${headerStyles.tools}`}>
              <div className={headerStyles.quick}>
                {user?.emailVerified && (
                  <FavoriteButton
                    kind="list"
                    targetId={list.id}
                    saved={favoriteIds.includes(list.id)}
                    title={list.title}
                  />
                )}
                {published && list.visibility === "PUBLIC" && (
                  <CopyLink path={listPath(list.id)} title={list.title} />
                )}
              </div>
              <div className={headerStyles.primary}>
                {list.canManage && (
                  <Link
                    className={`${styles["secondary-button"]} ${headerStyles["access-link"]}`}
                    href={sharingPath(list.id)}
                  >
                    <UsersRound size={18} aria-hidden="true" />{" "}
                    {t("List access")}
                  </Link>
                )}
                {list.canManage && (
                  <SharingCardDownload
                    modal
                    listId={list.id}
                    title={list.title}
                    theme={list.theme}
                    published={published}
                    privateList={list.visibility === "PRIVATE"}
                    premium={premium}
                  />
                )}
                {list.canManage && (
                  <Link
                    className={styles.button}
                    href={listSettingsPath(list.id)}
                    aria-label={t("List settings")}
                  >
                    <Settings size={18} aria-hidden="true" />
                    <span className={headerStyles["full-label"]}>
                      {t("List settings")}
                    </span>
                    <span
                      className={headerStyles["short-label"]}
                      aria-hidden="true"
                    >
                      {t("Settings")}
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </header>
      </ListTheme>

      {list.description && (
        <p className={styles.description}>{list.description}</p>
      )}

      {list.canManage && wishDeleted === "1" && (
        <SuccessMessage queryKeys={["wishDeleted"]}>
          {t("Wish deleted.")}
        </SuccessMessage>
      )}

      <WishCollection
        listId={list.id}
        userId={user?.emailVerified ? user.id : null}
        canManage={list.canManage}
        section={section}
        reservationsEnabled={published && list.reservationsEnabled}
        searchParams={query}
      />
    </section>
  );
}
