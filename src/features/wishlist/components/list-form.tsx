"use client";
import { Eye, EyeOff } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import styles from "@/components/shell.module.css";
import { ThemePicker } from "@/features/premium/components/theme-picker";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import { listPath, listsPath } from "@/paths";
import { createList, updateList } from "../actions/manage-list";
import formStyles from "./list-form.module.css";

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
  const [startsHidden, setStartsHidden] = useState(false);
  const VisibilityIcon = startsHidden ? EyeOff : Eye;

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

        {!list && (
          <div
            className={formStyles["visibility-notice"]}
            id={`${prefix}-visibility-help`}
          >
            <VisibilityIcon size={22} aria-hidden="true" />
            <div className={formStyles["visibility-content"]}>
              <div aria-live="polite" aria-atomic="true">
                <strong>
                  {startsHidden
                    ? t("Your new list starts hidden")
                    : t("Your new list starts visible")}
                </strong>
                <p>
                  {startsHidden
                    ? t(
                        "Only admins can see it until you publish it from the list page.",
                      )
                    : t(
                        "Your chosen audience can see it immediately. You can hide it now or from the list page at any time.",
                      )}
                </p>
              </div>
              <input
                type="hidden"
                name="publication"
                value={startsHidden ? "DRAFT" : "PUBLISHED"}
              />
              <button
                type="button"
                className={styles["secondary-button"]}
                onClick={() => setStartsHidden((hidden) => !hidden)}
              >
                {startsHidden ? t("Start visible") : t("Hide list")}
              </button>
            </div>
          </div>
        )}

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

        {!list && (
          <fieldset
            className={formStyles.audience}
            aria-describedby={`${prefix}-visibility-help`}
          >
            <legend>{t("Who can view this list?")}</legend>
            <label className={formStyles.choice}>
              <input
                type="radio"
                name="visibility"
                value="PUBLIC"
                defaultChecked={
                  (state.payload?.get("visibility") ?? "PUBLIC") === "PUBLIC"
                }
                aria-labelledby={`${prefix}-public-label`}
                aria-describedby={`${prefix}-public-help`}
              />
              <span>
                <strong id={`${prefix}-public-label`}>{t("Anyone")}</strong>
                <span id={`${prefix}-public-help`}>
                  {t(
                    "Appears in Browse. Anyone can view it without an account.",
                  )}
                </span>
              </span>
            </label>
            <label className={formStyles.choice}>
              <input
                type="radio"
                name="visibility"
                value="PRIVATE"
                disabled={!canCreatePrivate}
                defaultChecked={state.payload?.get("visibility") === "PRIVATE"}
                aria-labelledby={`${prefix}-private-label`}
                aria-describedby={`${prefix}-private-help`}
              />
              <span>
                <strong id={`${prefix}-private-label`}>
                  {t("Selected people")}
                </strong>
                <span id={`${prefix}-private-help`}>
                  {t(
                    "Stays out of Browse. Invited members and anyone with a guest link can view it.",
                  )}
                  {!canCreatePrivate && <> {t("Requires Premium.")}</>}
                </span>
              </span>
            </label>
          </fieldset>
        )}

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
