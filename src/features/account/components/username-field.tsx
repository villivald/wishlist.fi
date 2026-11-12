"use client";

import { useRef, useState } from "react";
import loadingStyles from "@/components/loading/loading-preview.module.css";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import fieldStyles from "./username-field.module.css";

export function UsernameField({
  initialValue,
  suggestion,
  errors,
  loading,
}: {
  initialValue: string;
  suggestion?: string;
  errors?: string[];
  loading: boolean;
}) {
  const t = useText();
  const [username, setUsername] = useState(initialValue);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.field}>
      <label htmlFor="profile-username">{t("Username")}</label>
      <input
        className={loading ? loadingStyles.control : undefined}
        id="profile-username"
        ref={input}
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        minLength={2}
        maxLength={40}
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        aria-invalid={!!errors?.length}
        aria-describedby={`profile-username-help${errors?.length ? " profile-username-error" : ""}`}
      />
      <p id="profile-username-help" className={styles["field-help"]}>
        {t("Your username is visible to other people.")}{" "}
        {t("Use 2–40 letters, numbers, underscores, or hyphens.")}
      </p>
      {suggestion && (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles["text-button"]} ${fieldStyles.suggestion}`}
            onClick={() => {
              setUsername(suggestion);
              input.current?.focus();
            }}
            aria-controls="profile-username"
          >
            {t("Use email suggestion")}:{" "}
            <span translate="no">{suggestion}</span>
          </button>
        </div>
      )}
      {errors?.length ? (
        <p id="profile-username-error" className={styles["error-text"]}>
          {errors.map(t.message).join(" ")}
        </p>
      ) : null}
    </div>
  );
}
