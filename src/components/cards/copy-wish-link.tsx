import { Copy } from "lucide-react";
import {
  type DetailSection,
  navigationPath,
} from "@/app/_navigation/navigation-path";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import styles from "./cards.module.css";

export function CopyWishLink({
  path,
  title,
  section,
}: {
  path: string;
  title: string;
  section?: DetailSection;
}) {
  const t = useText();
  return (
    <Link
      href={navigationPath(`${path}/copy`, section)}
      prefetch={false}
      className={styles["icon-action"]}
      aria-label={t("Copy {title} to my lists", { title })}
      title={t("Copy wish")}
    >
      <Copy size={18} aria-hidden="true" />
    </Link>
  );
}
