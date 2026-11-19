import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "@/components/shell.module.css";
import { getText } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Create a list"),
    robots: { index: false, follow: false },
  };
}

export default async function NewListLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getText();
  return (
    <section className={styles.editor}>
      <h1>{t("Create a list")}</h1>
      <p className={styles.muted}>
        {t("Give your list a name, then choose how you’d like to share it.")}
      </p>
      {children}
    </section>
  );
}
