"use client";

import { EyeOff } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import shell from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import {
  changePublication,
  type PublicationState,
} from "../actions/manage-list";
import { HideListReview } from "./hide-list-review";
import styles from "./publication-control.module.css";
import { PublishListReview } from "./publish-list-review";

export function PublicationControl({
  id,
  visible,
  visibility,
  premium,
}: {
  id: string;
  visible: boolean;
  visibility: "PUBLIC" | "PRIVATE";
  premium: boolean;
}) {
  const t = useText();
  const trigger = useRef<HTMLButtonElement>(null);
  const [dismissedAt, setDismissedAt] = useState<number>();
  const [state, submit, pending] = useActionState<PublicationState, FormData>(
    changePublication.bind(null, id),
    { ...EMPTY_ACTION_STATE, timestamp: 0 },
  );
  const review =
    dismissedAt === state.timestamp ? undefined : state.reservationReview;

  useEffect(() => {
    if (state.status === "SUCCESS" && document.activeElement === document.body)
      trigger.current?.focus({ preventScroll: true });
  }, [state.status, state.timestamp]);

  return (
    <div className={styles.control}>
      <form
        action={submit}
        className={shell.form}
        aria-busy={pending}
        hidden={!visible}
      >
        <ActionFeedback state={state} />
        <input type="hidden" name="publication" value="DRAFT" />
        <input type="hidden" name="expectedAccess" value={visibility} />
        {visible && (
          <button
            ref={trigger}
            type="submit"
            disabled={pending}
            className={shell["secondary-button"]}
          >
            <EyeOff size={18} aria-hidden="true" />
            {pending ? t("Updating…") : t("Hide list")}
          </button>
        )}
      </form>
      <PublishListReview
        id={id}
        visible={visible}
        visibility={visibility}
        premium={premium}
        trigger={trigger}
      />
      {review && (
        <HideListReview
          key={state.timestamp}
          reservations={review}
          action={submit}
          pending={pending}
          trigger={trigger}
          onDismiss={() => setDismissedAt(state.timestamp)}
        >
          <input type="hidden" name="publication" value="DRAFT" />
          <input
            type="hidden"
            name="expectedAccess"
            value={state.expectedAccess}
          />
        </HideListReview>
      )}
    </div>
  );
}
