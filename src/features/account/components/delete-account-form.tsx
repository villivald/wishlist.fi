"use client";
import { useActionState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import { removeAccount } from "../actions/manage-account";

export function DeleteAccountForm({
  impactToken,
  requiresPassword = true,
}: {
  impactToken: string;
  requiresPassword?: boolean;
}) {
  const t = useText();

  const [state, action, pending] = useActionState(removeAccount, {
    ...EMPTY_ACTION_STATE,
    timestamp: 0,
  });

  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <ActionFeedback state={state} />
      <input type="hidden" name="impactToken" value={impactToken} />
      <fieldset className={styles["form-fields"]} disabled={pending}>
        <legend className={styles["visually-hidden"]}>
          {t("Confirm account deletion")}
        </legend>
        {requiresPassword && (
          <div className={styles.field}>
            <label htmlFor="delete-password">{t("Current password")}</label>
            <input
              key={state.timestamp}
              id="delete-password"
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor="delete-confirmation">
            {t("Type DELETE to confirm")}
          </label>
          <input
            id="delete-confirmation"
            name="confirmation"
            autoComplete="off"
            spellCheck={false}
            pattern="DELETE"
            required
          />
        </div>
        <button type="submit" className={styles["danger-button"]}>
          {pending ? t("Deleting…") : t("Permanently delete account")}
        </button>
      </fieldset>
    </form>
  );
}
