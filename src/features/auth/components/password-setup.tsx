"use client";

import { useActionState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import { requestPasswordSetup } from "../actions/password-setup";

export function PasswordSetup() {
  const t = useText();
  const [state, action, pending] = useActionState(requestPasswordSetup, {
    ...EMPTY_ACTION_STATE,
    timestamp: 0,
  });
  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <p>
        {t(
          "You use Google to sign in. You can also set a password using a secure link sent to your account email.",
        )}
      </p>
      <button type="submit" disabled={pending} className={styles.button}>
        {pending ? t("Please wait…") : t("Send password setup link")}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}
