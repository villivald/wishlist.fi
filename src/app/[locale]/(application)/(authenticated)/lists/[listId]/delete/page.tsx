import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { deleteList } from "@/features/wishlist/actions/manage-list";
import { readManagedWishlist } from "@/features/wishlist/service/lists";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { listSettingsPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Delete list"),
    robots: { index: false, follow: false },
  };
}

export default async function DeleteListPage({
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
    <section className={styles.editor}>
      <h1>{t("Delete list?")}</h1>
      <p className={styles.description}>
        {t(
          "“{title}” and all its wishes and reservations will be permanently deleted. This cannot be undone.",
          { title: list.title },
        )}
      </p>
      <ActionForm
        requireConfirmation
        action={deleteList.bind(null, list.id)}
        label={t("Delete permanently")}
        pendingLabel={t("Deleting…")}
        destructive
      >
        <label className={styles["checkbox-label"]}>
          <input type="checkbox" name="confirm" value="delete" required />
          {t("I understand this cannot be undone")}
        </label>
      </ActionForm>
      <Link href={listSettingsPath(list.id)}>{t("Cancel and keep list")}</Link>
    </section>
  );
}
