"use client";

import { Eye } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import shell from "@/components/shell.module.css";
import { ListAccessControl } from "@/features/sharing/components/list-access-control";
import { useText } from "@/i18n/use-text";
import styles from "./publication-control.module.css";

export function PublishListReview({
  id,
  visible,
  visibility,
  premium,
  trigger,
}: {
  id: string;
  visible: boolean;
  visibility: "PRIVATE" | "PUBLIC";
  premium: boolean;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const t = useText();
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [audience, setAudience] = useState<typeof visibility>();
  useEffect(() => {
    if (audience) {
      dialog.current?.showModal();
      heading.current?.focus();
    }
  }, [audience]);
  const close = useCallback(() => dialog.current?.close(), []);

  return (
    <>
      {!visible && (
        <button
          ref={trigger}
          type="button"
          className={shell["secondary-button"]}
          aria-haspopup="dialog"
          aria-controls={`${headingId}-dialog`}
          onClick={() => setAudience(visibility)}
        >
          <Eye size={18} aria-hidden="true" /> {t("Publish list")}
        </button>
      )}
      <dialog
        ref={dialog}
        id={`${headingId}-dialog`}
        className={styles.dialog}
        aria-labelledby={headingId}
        onClose={() => {
          setAudience(undefined);
          trigger.current?.focus();
        }}
        onCancel={(event) => {
          if (event.currentTarget.querySelector('form[aria-busy="true"]'))
            event.preventDefault();
        }}
      >
        <div className={styles.content}>
          <h2 id={headingId} ref={heading} tabIndex={-1}>
            {t("Publish list")}
          </h2>
          {audience && (
            <ListAccessControl
              listId={id}
              publication="DRAFT"
              visibility={audience}
              premium={premium}
              initialAccess={audience}
              visibleOnly
              onSaved={close}
              onCancel={close}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
