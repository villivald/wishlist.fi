import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { WishForm } from "@/features/wish/components/wish-form";
import { readManagedWishlist } from "@/features/wishlist/service/lists";
import { getText } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Add a wish"),
    robots: { index: false, follow: false },
  };
}

export default async function NewWishPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const { listId } = await params;
  const list = await readManagedWishlist(listId, user.id);

  if (!list) {
    notFound();
  }

  return (
    <section className={`${styles.page} ${styles["profile-page"]}`}>
      <header className={styles["page-heading"]}>
        <div>
          <h1>{t("Add a wish")}</h1>
          <p className={styles.description}>
            {t(
              "In “{title}”. Start with a title and add any details you like.",
              { title: list.title },
            )}
          </p>
        </div>
      </header>
      <WishForm listId={list.id} />
    </section>
  );
}
