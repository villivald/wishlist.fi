import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useText } from "@/i18n/use-text";
import { listAccess, listAccessLabels } from "../list-access";
import styles from "./list-publication.module.css";

export function ListPublication({
  list,
}: {
  list: {
    id: string;
    publication: "DRAFT" | "PUBLISHED";
    visibility: "PUBLIC" | "PRIVATE";
  };
}) {
  const t = useText();
  const visible = list.publication === "PUBLISHED";
  const anyone = list.visibility === "PUBLIC";
  const Icon = !visible ? EyeOff : anyone ? Eye : LockKeyhole;

  return (
    <section
      id="list-visibility"
      className={styles.panel}
      aria-label={t("List visibility")}
    >
      <p className={styles.status}>
        <Icon size={20} aria-hidden="true" />
        <strong>
          <span className={styles["full-status"]}>
            {t(listAccessLabels[listAccess(list)])}
          </span>
          <span className={styles["short-status"]} aria-hidden="true">
            {t(!visible ? "Hidden" : anyone ? "Public" : "Invited people")}
          </span>
        </strong>
      </p>
      <p className={styles.help}>
        {visible
          ? t("Hiding the list ends its active reservations.")
          : t("Publish to choose who can view this list.")}
      </p>
    </section>
  );
}
