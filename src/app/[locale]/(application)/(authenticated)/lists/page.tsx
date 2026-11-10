import { List } from "lucide-react";
import type { Metadata } from "next";
import { SuccessMessage } from "@/components/form/success-message";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { readFavoriteIds } from "@/features/favorites/service/favorites";
import { MyListCard } from "@/features/wishlist/components/my-list-card";
import { MyListsControls } from "@/features/wishlist/components/my-lists-controls";
import { readMyWishlists } from "@/features/wishlist/service/lists";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { listsPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("My lists"),
    robots: { index: false, follow: false },
  };
}

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    deleted?: string;
    shared?: string;
    joined?: string;
    left?: string;
    roleChanged?: string;
  }>;
}) {
  const t = await getText();

  const params = await searchParams;
  const { user } = await getAuthOrRedirect();
  const { lists, page, hasNextPage } = await readMyWishlists(
    user.id,
    Number(params.page ?? 1),
    params.shared === "1",
  );
  const favoriteIds = await readFavoriteIds(
    user.id,
    "list",
    lists.map(({ id }) => id),
  );

  return (
    <section className={styles.page}>
      <MyListsControls includeShared={params.shared === "1"} />
      {params.joined === "1" && (
        <SuccessMessage queryKeys={["joined"]}>
          {t("Invitation accepted. You have joined the list.")}
        </SuccessMessage>
      )}
      {params.left === "1" && (
        <SuccessMessage queryKeys={["left"]}>
          {t("You have left the list.")}
        </SuccessMessage>
      )}
      {params.roleChanged === "1" && (
        <SuccessMessage queryKeys={["roleChanged"]}>
          {t("You are now a member. Admin controls are no longer available.")}
        </SuccessMessage>
      )}

      {params.deleted === "1" && (
        <SuccessMessage queryKeys={["deleted"]}>
          {t("List deleted.")}
        </SuccessMessage>
      )}

      {lists.length ? (
        <ul className={styles["list-grid"]}>
          {lists.map((list) => (
            <MyListCard
              key={list.id}
              list={list}
              favorite={favoriteIds.includes(list.id)}
            />
          ))}
        </ul>
      ) : (
        <div className={styles["empty-state"]}>
          <List aria-hidden="true" />
          <h2>{page === 1 ? t("No lists yet") : t("No more lists")}</h2>
          <p className={styles.muted}>
            {page === 1
              ? t("Create your first list and make it your own.")
              : t("Return to an earlier page to find your lists.")}
          </p>
        </div>
      )}

      {(page > 1 || hasNextPage) && (
        <nav className={styles.actions} aria-label={t("List pages")}>
          {page > 1 && (
            <Link
              href={`${listsPath}?page=${page - 1}${params.shared === "1" ? "&shared=1" : ""}`}
            >
              {t("Previous page")}
            </Link>
          )}
          <span>
            {t("Page")} {page}
          </span>
          {hasNextPage && (
            <Link
              href={`${listsPath}?page=${page + 1}${params.shared === "1" ? "&shared=1" : ""}`}
            >
              {t("Next page")}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
