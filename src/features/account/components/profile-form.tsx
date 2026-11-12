"use client";
import { Eye, LockKeyhole } from "lucide-react";
import { useActionState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import loadingStyles from "@/components/loading/loading-preview.module.css";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import { saveProfile } from "../actions/manage-account";
import { UsernameField } from "./username-field";

export function ProfileForm({
  profile,
  usernameSuggestion,
  loading = false,
  premium = false,
}: {
  profile: {
    username: string;
    name: string | null;
    description: string | null;
    showPremiumBadge?: boolean;
  };
  usernameSuggestion?: string;
  premium?: boolean;
  loading?: boolean;
}) {
  const t = useText();

  const [state, action, pending] = useActionState(saveProfile, {
    ...EMPTY_ACTION_STATE,
    timestamp: 0,
  });

  return (
    <form
      action={action}
      className={styles.form}
      aria-busy={pending || loading}
      inert={loading || undefined}
    >
      <div className={styles["profile-guidance"]}>
        <div>
          <Eye size={20} aria-hidden="true" />
          <p>
            <strong>{t("Your public profile")}</strong>
            <span>
              {t(
                "Your name, avatar, and About you appear in People when you have a list visible to anyone.",
              )}
            </span>
          </p>
        </div>
        <div className={styles.muted}>
          <LockKeyhole size={20} aria-hidden="true" />
          <p>{t("Your email stays private.")}</p>
        </div>
      </div>
      <fieldset className={styles["form-fields"]} disabled={pending || loading}>
        <legend className={styles["visually-hidden"]}>
          {t("Profile details")}
        </legend>
        <UsernameField
          key={state.timestamp}
          initialValue={String(
            state.payload?.get("username") ?? profile.username,
          )}
          suggestion={usernameSuggestion}
          errors={state.fieldErrors.username}
          loading={loading}
        />
        <div className={styles.field}>
          <label htmlFor="profile-name">{t("Display name")}</label>
          <input
            className={loading ? loadingStyles.control : undefined}
            key={state.timestamp}
            id="profile-name"
            name="name"
            autoComplete="name"
            maxLength={80}
            defaultValue={String(
              state.payload?.get("name") ?? profile.name ?? "",
            )}
            aria-invalid={!!state.fieldErrors.name?.length}
            aria-describedby={
              state.fieldErrors.name?.length
                ? "profile-name-help profile-name-error"
                : "profile-name-help"
            }
          />
          <p id="profile-name-help" className={styles["field-help"]}>
            {t(
              "Optional · Leave blank to show your username. Up to 80 characters.",
            )}
          </p>
          {state.fieldErrors.name && (
            <p id="profile-name-error" className={styles["error-text"]}>
              {state.fieldErrors.name.map(t.message).join(" ")}
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor="profile-description">{t("About you")}</label>
          <textarea
            className={loading ? loadingStyles.control : undefined}
            key={state.timestamp}
            id="profile-description"
            name="description"
            rows={4}
            maxLength={1000}
            defaultValue={String(
              state.payload?.get("description") ?? profile.description ?? "",
            )}
            aria-invalid={!!state.fieldErrors.description?.length}
            aria-describedby={
              state.fieldErrors.description?.length
                ? "profile-description-help profile-description-error"
                : "profile-description-help"
            }
          />
          <p id="profile-description-help" className={styles["field-help"]}>
            {t(
              "Optional · Up to 1,000 characters. Longer bios have a Read more button in People.",
            )}
          </p>
          {state.fieldErrors.description && (
            <p id="profile-description-error" className={styles["error-text"]}>
              {state.fieldErrors.description.map(t.message).join(" ")}
            </p>
          )}
        </div>
        <div>
          <label className={styles["checkbox-label"]}>
            <input
              type="checkbox"
              name="showPremiumBadge"
              key={`badge-${state.timestamp}`}
              defaultChecked={
                state.payload
                  ? state.payload.get("showPremiumBadge") === "on"
                  : profile.showPremiumBadge
              }
              disabled={!premium && !profile.showPremiumBadge}
            />
            {t("Show a Premium badge on my public profile")}
          </label>
          <p className={styles.muted}>
            {t(
              "Optional. Visible in People only while Premium is active. You can hide it at any time.",
            )}
          </p>
        </div>
        <button type="submit" className={styles.button}>
          {pending ? t("Saving…") : t("Save profile")}
        </button>
      </fieldset>
      <ActionFeedback state={state} />
    </form>
  );
}
