"use client";
import { useActionState, useId } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import styles from "@/components/shell.module.css";
import { ThemePicker } from "@/features/premium/components/theme-picker";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { listPath, listsPath } from "@/paths";
import { createList, updateList } from "../actions/manage-list";
import { ListAccessChoices } from "./list-access-choices";

type ListValues = {
  id: string;
  title: string;
  theme?: string;
  description: string | null;
  reservationsEnabled: boolean;
};

export function ListForm({
  list,
  canCreatePrivate = false,
  canCustomizeTheme = canCreatePrivate,
}: {
  list?: ListValues;
  canCreatePrivate?: boolean;
  canCustomizeTheme?: boolean;
}) {
  const t = useText();

  const [state, action, pending] = useActionState(
    list ? updateList.bind(null, list.id) : createList,
    { ...EMPTY_ACTION_STATE, timestamp: 0 },
  );
  const prefix = useId();
  const submittedAccess = state.payload?.get("access");

  const fieldValue = (name: "title" | "description") => {
    const submitted = state.payload?.get(name);

    return typeof submitted === "string" ? submitted : (list?.[name] ?? "");
  };

  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <ActionFeedback state={state} />

      <fieldset
        key={state.timestamp}
        disabled={pending}
        className={styles["form-fields"]}
      >
        <legend className={styles["visually-hidden"]}>
          {t("List details")}
        </legend>

        <div className={styles.field}>
          <label htmlFor={`${prefix}-title`}>{t("Title")}</label>
          <input
            id={`${prefix}-title`}
            name="title"
            required
            maxLength={200}
            defaultValue={fieldValue("title")}
            aria-invalid={!!state.fieldErrors.title?.length}
            aria-describedby={`${prefix}-title-help`}
          />
          <p
            id={`${prefix}-title-help`}
            className={
              state.fieldErrors.title ? styles["error-text"] : styles.muted
            }
          >
            {state.fieldErrors.title?.map(t.message).join(" ") ??
              t("Give your list a name. Up to 200 characters.")}
          </p>
        </div>

        {!list && (
          <ListAccessChoices
            defaultValue={
              submittedAccess === "HIDDEN" || submittedAccess === "PRIVATE"
                ? submittedAccess
                : "PUBLIC"
            }
            premium={canCreatePrivate}
          />
        )}

        <div className={styles.field}>
          <label htmlFor={`${prefix}-description`}>
            {t("Description (optional)")}
          </label>
          <textarea
            id={`${prefix}-description`}
            name="description"
            rows={5}
            maxLength={2000}
            defaultValue={fieldValue("description")}
            aria-invalid={!!state.fieldErrors.description?.length}
            aria-describedby={`${prefix}-description-help`}
          />
          <p
            id={`${prefix}-description-help`}
            className={
              state.fieldErrors.description
                ? styles["error-text"]
                : styles.muted
            }
          >
            {state.fieldErrors.description?.map(t.message).join(" ") ??
              t("Add a little context. Up to 2,000 characters.")}
          </p>
        </div>

        <div>
          <label className={styles["checkbox-label"]}>
            <input
              type="checkbox"
              name="reservationsEnabled"
              defaultChecked={
                state.payload
                  ? state.payload.get("reservationsEnabled") === "on"
                  : (list?.reservationsEnabled ?? true)
              }
              aria-describedby={`${prefix}-reservations-help`}
            />
            {t("Allow reservations")}
          </label>
          <p id={`${prefix}-reservations-help`} className={styles.muted}>
            {t(
              "Applies once the list is visible. Turning this off keeps existing reservations.",
            )}
          </p>
        </div>

        <ThemePicker
          current={list?.theme ?? "classic"}
          initial={String(
            state.payload?.get("theme") ?? list?.theme ?? "classic",
          )}
          premium={canCustomizeTheme}
        />
        <div className={styles.actions}>
          <button type="submit" className={styles.button}>
            {pending
              ? t("Saving…")
              : list
                ? t("Save changes")
                : t("Create list")}
          </button>
          <Link href={list ? listPath(list.id) : listsPath}>{t("Cancel")}</Link>
        </div>
      </fieldset>
    </form>
  );
}
