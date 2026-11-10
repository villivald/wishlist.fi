"use client";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useText();

  return (
    <section className={styles["account-panel"]}>
      <h1>{t("Something went wrong")}</h1>
      <p>{t("Please try again in a moment.")}</p>
      <button type="button" className={styles.button} onClick={reset}>
        {t("Try again")}
      </button>
    </section>
  );
}
