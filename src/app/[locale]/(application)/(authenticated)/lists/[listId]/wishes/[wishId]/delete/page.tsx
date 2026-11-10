import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/form/action-form";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { removeWish } from "@/features/wish/actions/manage-wish";
import { readWish } from "@/features/wish/service/wishes";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { wishPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Delete wish"),
    robots: { index: false, follow: false },
  };
}

export default async function DeleteWishPage({
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
    <section className={styles.editor}>
      <h1>{t("Delete wish?")}</h1>
      <p className={styles.description}>
        {t(
          "“{title}” and its reservations will be permanently deleted. This cannot be undone.",
          { title: wish.title },
        )}
      </p>
      <ActionForm
        requireConfirmation
        action={removeWish.bind(null, listId, wishId)}
        label={t("Delete permanently")}
        pendingLabel={t("Deleting…")}
        destructive
      >
        <label className={styles["checkbox-label"]}>
          <input type="checkbox" name="confirm" value="delete" required />
          {t("I understand this cannot be undone")}
        </label>
      </ActionForm>
      <Link href={wishPath(listId, wishId)}>{t("Cancel and keep wish")}</Link>
    </section>
  );
}
