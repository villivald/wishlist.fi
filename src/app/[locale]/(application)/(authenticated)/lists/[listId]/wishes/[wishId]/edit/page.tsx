import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { ImageEditor } from "@/features/media/components/image-editor";
import { WishForm } from "@/features/wish/components/wish-form";
import { readWish } from "@/features/wish/service/wishes";
import { getText } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Edit wish"),
    robots: { index: false, follow: false },
  };
}

export default async function EditWishPage({
  params,
}: {
  params: Promise<{ listId: string; wishId: string }>;
}) {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const { listId, wishId } = await params;
  const wish = await readWish(listId, wishId, user.id, true);

  if (!wish) {
    notFound();
  }

  return (
    <section className={`${styles.page} ${styles["profile-page"]}`}>
      <header className={styles["page-heading"]}>
        <div>
          <h1>{t("Edit wish")}</h1>
          <p className={styles.description}>
            {t("In “{title}”. Update the wish details and image.", {
              title: wish.wishlist.title,
            })}
          </p>
        </div>
      </header>
      <div className={styles["content-columns"]}>
        <div className={styles["content-panel"]}>
          <WishForm listId={listId} wish={wish} />
        </div>
        <div className={styles["content-panel"]}>
          <ImageEditor
            target={{ kind: "wish", listId, wishId }}
            image={wish.image}
            fallbackAlt={wish.title}
          />
        </div>
      </div>
    </section>
  );
}
