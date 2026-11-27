import { Gift } from "lucide-react";
import type { ReactNode } from "react";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";

export function ReservationsFrame({ children }: { children: ReactNode }) {
  const t = useText();

  return (
    <section className={styles.page}>
      <div className={styles["page-heading"]}>
        <div>
          <h1>{t("My reservations")}</h1>
          <p className={styles.muted}>
            {t("Gifts you plan to get, on your own or with a group.")}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function EmptyReservations({ page = 1 }: { page?: number }) {
  const t = useText();

  return (
    <div className={styles["empty-state"]}>
      <Gift aria-hidden="true" />
      <h2 id="reservation-results" tabIndex={-1}>
        {page === 1 ? t("No active reservations") : t("No more reservations")}
      </h2>
      <p className={styles.muted}>
        {page === 1
          ? t("Open a shared wishlist and reserve a wish to find it here.")
          : t("Return to an earlier page.")}
      </p>
    </div>
  );
}

export function ReservationHelp() {
  const t = useText();

  return (
    <p className={styles.muted}>
      {t(
        "A reservation ends when its wish is hidden, fulfilled, or deleted, its list is hidden, or you lose access to the list.",
      )}
    </p>
  );
}
