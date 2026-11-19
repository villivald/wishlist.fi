"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import styles from "@/components/shell.module.css";
import { HideListReview } from "@/features/wishlist/components/hide-list-review";
import { ListAccessChoices } from "@/features/wishlist/components/list-access-choices";
import { type ListAccess, listAccess } from "@/features/wishlist/list-access";
import { useText } from "@/i18n/use-text";
import { changeListAccess } from "../actions/manage-sharing";
import sharingStyles from "./sharing.module.css";

export function ListAccessControl({
  listId,
  publication,
  visibility,
  premium,
  guestLinks = 0,
  initialAccess,
  visibleOnly = false,
  onSaved,
  onCancel,
}: {
  listId: string;
  publication: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "PRIVATE";
  premium: boolean;
  guestLinks?: number;
  initialAccess?: ListAccess;
  visibleOnly?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const t = useText();
  const current = listAccess({ publication, visibility });
  const [selection, setSelection] = useState({
    current,
    value: initialAccess ?? current,
    confirmed: false,
  });
  if (selection.current !== current)
    setSelection({ current, value: current, confirmed: false });
  const selected = selection.value;
  const setSelected = (value: ListAccess) =>
    setSelection({ current, value, confirmed: false });
  const [state, action, pending] = useActionState(
    changeListAccess.bind(null, listId),
    {
      ...EMPTY_ACTION_STATE,
      timestamp: 0,
    },
  );
  const form = useRef<HTMLFormElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [dismissedAt, setDismissedAt] = useState<number>();
  const review =
    dismissedAt === state.timestamp ? undefined : state.reservationReview;
  const changed = selected !== current;
  useEffect(() => {
    if (state.status !== "SUCCESS") return;
    if (onSaved) onSaved();
    else if (document.activeElement === document.body)
      form.current
        ?.querySelector<HTMLInputElement>('input[name="access"]:checked')
        ?.focus({ preventScroll: true });
  }, [state.status, state.timestamp, onSaved]);
  const confirmation =
    selected === "HIDDEN"
      ? t(
          "Members and guest links will lose access. Active reservations will end. Only admins will be able to open this list.",
        )
      : selected === "PRIVATE"
        ? current === "HIDDEN"
          ? t(
              "Members can open this list with their account. Active guest links give view-only access.",
            )
          : t(
              "Only admins, accepted members and active guest links will have access. Reservations for people losing access will end.",
            )
        : t(
            "Anyone will be able to view this list without signing in and find it in Browse.",
          );
  const label =
    selected === "HIDDEN"
      ? t("Hide list")
      : selected === "PRIVATE"
        ? t("Share with invited people")
        : t("Make list public");
  return (
    <>
      <form
        ref={form}
        action={action}
        className={styles.form}
        aria-busy={pending}
        onReset={(event) => event.preventDefault()}
      >
        <ActionFeedback state={state} />
        <input type="hidden" name="expectedAccess" value={current} />
        <fieldset disabled={pending} className={sharingStyles["access-fields"]}>
          <legend className={styles["visually-hidden"]}>
            {t("List access")}
          </legend>
          <ListAccessChoices
            value={selected}
            onChange={setSelected}
            premium={premium}
            canKeepPrivate={visibility === "PRIVATE"}
            hideLegend
            visibleOnly={visibleOnly}
          />
          {changed && (
            <fieldset className={sharingStyles["audience-review"]}>
              <legend>{t("Review access change")}</legend>
              {!visibleOnly && (
                <p className={styles.muted}>
                  {t("Your current access stays in place until you save.")}
                </p>
              )}
              <label className={styles["checkbox-label"]} key={selected}>
                <input
                  type="checkbox"
                  name="confirm"
                  value="yes"
                  required
                  checked={selection.confirmed}
                  onChange={(event) =>
                    setSelection({
                      current,
                      value: selected,
                      confirmed: event.target.checked,
                    })
                  }
                />
                {confirmation}
              </label>
              {selected === "PRIVATE" &&
                publication === "DRAFT" &&
                guestLinks > 0 && (
                  <p>
                    {t(
                      "Active guest links: {count}. These links will also allow viewing when you share this list.",
                      { count: guestLinks },
                    )}
                  </p>
                )}
              <p className={styles["field-help"]}>
                {t("Check the box above to continue.")}
              </p>
              <div className={styles.actions}>
                <button
                  ref={trigger}
                  type="submit"
                  disabled={!selection.confirmed}
                  className={
                    selected === "HIDDEN"
                      ? styles["danger-button"]
                      : styles.button
                  }
                >
                  {pending ? t("Saving…") : label}
                </button>
                <button
                  type="button"
                  className={styles["secondary-button"]}
                  onClick={() => {
                    if (onCancel) return onCancel();
                    setSelected(current);
                    form.current
                      ?.querySelector<HTMLInputElement>(
                        `input[name="access"][value="${current}"]`,
                      )
                      ?.focus();
                  }}
                >
                  {t("Cancel")}
                </button>
              </div>
            </fieldset>
          )}
        </fieldset>
      </form>
      {review && selected === "HIDDEN" && (
        <HideListReview
          key={state.timestamp}
          reservations={review}
          action={action}
          pending={pending}
          trigger={trigger}
          onDismiss={() => setDismissedAt(state.timestamp)}
        >
          <input type="hidden" name="access" value="HIDDEN" />
          <input type="hidden" name="expectedAccess" value={current} />
          <input type="hidden" name="confirm" value="yes" />
        </HideListReview>
      )}
    </>
  );
}
