import type { Metadata } from "next";
import { notFound } from "next/navigation";
import managementStyles from "@/components/list-management.module.css";
import { ListManagementNavigation } from "@/components/list-management-navigation";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { ImageEditor } from "@/features/media/components/image-editor";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import { ListForm } from "@/features/wishlist/components/list-form";
import { ListDeletionSettings } from "@/features/wishlist/components/list-settings";
import settingsStyles from "@/features/wishlist/components/list-settings.module.css";
import { readManagedWishlist } from "@/features/wishlist/service/lists";
import { getText } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("List settings"),
    robots: { index: false, follow: false },
  };
}

export default async function ListSettingsPage({
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

  const access = await readPremiumAccess(list.ownerId!);

  return (
    <div className={managementStyles.page}>
      <header className={managementStyles.header}>
        <ListManagementNavigation listId={listId} current="settings" />
        <h1>{t("List settings")}</h1>
        <p className={styles.description}>{list.title}</p>
      </header>
      <div className={styles["content-columns"]}>
        <section
          className={managementStyles.panel}
          aria-labelledby="list-details-heading"
        >
          <h2 id="list-details-heading">{t("Details and reservations")}</h2>
          <ListForm list={list} canCustomizeTheme={access.plan === "PREMIUM"} />
        </section>
        <div
          className={`${managementStyles.panel} ${settingsStyles["image-panel"]}`}
        >
          <ImageEditor target={{ kind: "list", listId }} image={list.image} />
        </div>
      </div>
      <ListDeletionSettings id={list.id} />
    </div>
  );
}
