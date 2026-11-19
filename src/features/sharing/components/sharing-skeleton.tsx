import { ArrowLeft, Settings } from "lucide-react";
import managementStyles from "@/components/list-management.module.css";
import loading from "@/components/loading/loading-preview.module.css";
import shell from "@/components/shell.module.css";
import { ListAccessChoices } from "@/features/wishlist/components/list-access-choices";
import { useText } from "@/i18n/use-text";
import styles from "./sharing.module.css";

export function SharingSkeleton({
  guestLinks = false,
}: {
  guestLinks?: boolean;
}) {
  const t = useText();

  const heading = guestLinks ? t("Guest links") : t("List access");

  return (
    <section className={managementStyles.page} data-loading-preview>
      <p role="status" className={shell["visually-hidden"]}>
        {t("Loading")} {heading.toLowerCase()}…
      </p>
      <div
        className={managementStyles.page}
        aria-hidden="true"
        aria-busy="true"
        inert
      >
        <div className={managementStyles.header}>
          <div className={managementStyles.navigation}>
            <span className={managementStyles["back-preview"]}>
              <ArrowLeft size={18} />
              {guestLinks
                ? t("Back to sharing and members")
                : t("Back to list")}
            </span>
            {!guestLinks && (
              <span className={managementStyles["back-preview"]}>
                <Settings size={18} /> {t("List settings")}
              </span>
            )}
          </div>
          <h1>{heading}</h1>
          <div className={`${loading.block} ${loading.line}`} />
          {guestLinks && (
            <p className={shell.muted}>
              {t("Let someone view your wishes without creating an account.")}
            </p>
          )}
        </div>
        {!guestLinks && (
          <div className={managementStyles.panel}>
            <h2>{t("Who can view this list?")}</h2>
            <div className={styles["access-summary"]}>
              <div className={`${loading.block} ${loading.label}`} />
              <div className={`${loading.block} ${loading.line}`} />
            </div>
            <ListAccessChoices premium hideLegend disabled />
            <div className={styles["access-next"]}>
              <div className={`${loading.block} ${loading.line}`} />
              <div className={`${loading.block} ${loading.button}`} />
            </div>
          </div>
        )}
        {(guestLinks ? [0, 1] : [0]).map((index) => (
          <div key={index} className={managementStyles.panel}>
            {guestLinks ? (
              <div className={`${loading.block} ${loading.title}`} />
            ) : (
              <h2>{t("Invite people")}</h2>
            )}
            <div className={`${loading.block} ${loading.line}`} />
            <div className={`${loading.block} ${loading.toolbar}`} />
            <div className={`${loading.block} ${loading.button}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
