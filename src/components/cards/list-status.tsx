import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import styles from "@/components/shell.module.css";
import { listAccess, listAccessLabels } from "@/features/wishlist/list-access";
import { useText } from "@/i18n/use-text";

export function ListStatus({
  publication,
  visibility,
}: {
  publication: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "PRIVATE";
}) {
  const t = useText();

  const hidden = publication === "DRAFT";
  const privateList = visibility === "PRIVATE";
  const Icon = hidden ? EyeOff : privateList ? LockKeyhole : Eye;

  return (
    <p
      className={`${styles.badge} ${styles["icon-label"]}`}
      title={
        hidden
          ? t("Only list admins. This list is hidden from viewers.")
          : privateList
            ? t("Invited members and people with an active guest link.")
            : t("Anyone can find this list in Browse and open its link.")
      }
    >
      <Icon size={16} aria-hidden="true" />
      {t(listAccessLabels[listAccess({ publication, visibility })])}
    </p>
  );
}
