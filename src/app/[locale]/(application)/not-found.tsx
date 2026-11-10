import { BackLink } from "@/components/back-link";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";

export default function NotFound() {
  const t = useText();

  return (
    <section className={styles["account-panel"]}>
      <h1>{t("Page not found")}</h1>
      <p>{t("This page is unavailable.")}</p>
      <BackLink href="/">{t("Back to home")}</BackLink>
    </section>
  );
}
