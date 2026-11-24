import {
  ArrowRight,
  ExternalLink,
  Gift,
  Pencil,
  Settings,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  type DetailSection,
  navigationPath,
} from "@/app/_navigation/navigation-path";
import { FavoriteButton } from "@/features/favorites/components/favorite-button";
import type { FavoriteTarget } from "@/features/favorites/types";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import styles from "./cards.module.css";
import { CopyLink } from "./copy-link";
import { CopyWishLink } from "./copy-wish-link";

export function OwnershipBadge({
  user = false,
  edge = false,
}: {
  user?: boolean;
  edge?: boolean;
}) {
  const t = useText();

  return (
    <span className={`${styles.ownership} ${edge ? styles["edge-badge"] : ""}`}>
      <UserRound size={15} aria-hidden="true" />
      {user ? t("You") : t("Your list")}
    </span>
  );
}

export function CardActions({
  path,
  title,
  canManage = false,
  sharingPath,
  settingsPath,
  canCopy = false,
  canCopyWish = false,
  section,
  productUrl,
  canReserve = false,
  favorite,
  children,
}: {
  path: string;
  title: string;
  canManage?: boolean;
  sharingPath?: string;
  settingsPath?: string;
  canCopy?: boolean;
  canCopyWish?: boolean;
  section?: DetailSection;
  productUrl?: string | null;
  canReserve?: boolean;
  favorite?: FavoriteTarget;
  children?: ReactNode;
}) {
  const t = useText();

  return (
    <div className={styles.actions}>
      <Link
        href={navigationPath(path, section)}
        className={styles["open-action"]}
        aria-label={t("View {value0}", { value0: title })}
      >
        {t("View")} <ArrowRight size={18} aria-hidden="true" />
      </Link>
      <div className={styles.tools}>
        {canCopyWish && (
          <CopyWishLink path={path} title={title} section={section} />
        )}
        {favorite && <FavoriteButton {...favorite} title={title} />}
        {canReserve && (
          <Link
            href={`${navigationPath(path, section)}#reservation-heading`}
            className={styles["icon-action"]}
            aria-label={t("Reserve {value0}", { value0: title })}
            title={t("Reserve wish")}
          >
            <Gift size={18} aria-hidden="true" />
          </Link>
        )}
        {productUrl && (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles["icon-action"]}
            aria-label={t("Product link for {value0} (opens in a new tab)", {
              value0: title,
            })}
            title={t("View product (opens in a new tab)")}
          >
            <ExternalLink size={18} aria-hidden="true" />
          </a>
        )}
        {canCopy && <CopyLink path={path} title={title} />}
        {canManage && (
          <Link
            href={settingsPath ?? `${path}/edit`}
            className={styles["icon-action"]}
            aria-label={t(
              settingsPath ? "Settings for {value0}" : "Edit {value0}",
              { value0: title },
            )}
            title={settingsPath ? t("List settings") : t("Edit")}
          >
            {settingsPath ? (
              <Settings size={18} aria-hidden="true" />
            ) : (
              <Pencil size={18} aria-hidden="true" />
            )}
          </Link>
        )}
        {sharingPath && (
          <Link
            href={sharingPath}
            className={styles["icon-action"]}
            aria-label={t("Manage sharing for {value0}", { value0: title })}
            title={t("Manage sharing")}
          >
            <UsersRound size={18} aria-hidden="true" />
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
