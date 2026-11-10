import type { Metadata } from "next";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import { ListForm } from "@/features/wishlist/components/list-form";
import { getText } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Create a list"),
    robots: { index: false, follow: false },
  };
}

export default async function NewListPage() {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const access = await readPremiumAccess(user.id);

  return (
    <section className={styles.editor}>
      <h1>{t("Create a list")}</h1>
      <p className={styles.muted}>
        {t("Give your list a name, then choose how you’d like to share it.")}
      </p>
      <ListForm canCreatePrivate={access.plan === "PREMIUM"} />
    </section>
  );
}
