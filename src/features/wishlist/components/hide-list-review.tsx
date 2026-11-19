"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import shell from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import type { ReservedWish } from "../service/reservation-review";
import styles from "./publication-control.module.css";

export function HideListReview({
  reservations,
  action,
  pending,
  trigger,
  onDismiss,
  children,
}: {
  reservations: ReservedWish[];
  action: (data: FormData) => void;
  pending: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const t = useText();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
    const button = trigger.current;
    return () => button?.focus();
  }, [trigger]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={id}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onDismiss}
    >
      <form action={action} className={styles.content} aria-busy={pending}>
        <h2 id={id}>{t("Hide this list?")}</h2>
        <p id={`${id}-description`}>
          {t(
            "These reservations will end and cannot be restored. Only list admins will be able to open the list.",
          )}
        </p>
        <p className={shell.eyebrow}>
          {t("Reserved wishes: {value0}", { value0: reservations.length })}
        </p>
        <ul className={styles.wishes}>
          {reservations.slice(0, 5).map((reservation) => (
            <li key={reservation.id}>{reservation.wishTitle}</li>
          ))}
        </ul>
        {reservations.length > 5 && (
          <p>{t("And {value0} more.", { value0: reservations.length - 5 })}</p>
        )}
        {children}
        {reservations.map(({ id: reservationId }) => (
          <input
            key={reservationId}
            type="hidden"
            name="confirmedReservation"
            value={reservationId}
          />
        ))}
        <div className={styles.actions}>
          <button
            ref={cancel}
            type="button"
            className={shell["secondary-button"]}
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className={shell["danger-button"]}
            disabled={pending}
          >
            {pending ? t("Updating…") : t("Hide list and end reservations")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
