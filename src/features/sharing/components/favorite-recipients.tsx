"use client";

import { Check, Star } from "lucide-react";
import { useId } from "react";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import sharingStyles from "./sharing.module.css";

export type FavoriteRecipient = {
  id: string;
  name: string | null;
  username: string;
};

export function FavoriteRecipients({
  favorites,
  selectedId,
  onSelect,
}: {
  favorites: FavoriteRecipient[];
  selectedId?: string;
  onSelect: (person: FavoriteRecipient | null) => void;
}) {
  const t = useText();
  const id = useId();
  if (!favorites.length) return null;
  return (
    <div className={sharingStyles.suggestions}>
      <p id={id}>
        <Star size={18} aria-hidden="true" /> {t("From your favorites")}
      </p>
      <div role="group" aria-labelledby={id}>
        {favorites.map((person) => (
          <button
            key={person.id}
            type="button"
            aria-pressed={selectedId === person.id}
            className={sharingStyles.recipient}
            onClick={() => onSelect(selectedId === person.id ? null : person)}
          >
            <span className={sharingStyles.avatar} aria-hidden="true">
              {(person.name ?? person.username)
                .slice(0, 1)
                .toLocaleUpperCase(t.locale)}
            </span>
            <span className={sharingStyles["recipient-identity"]}>
              <strong>{person.name ?? person.username}</strong>
              <span>@{person.username}</span>
            </span>
            {selectedId === person.id && <Check size={18} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <p className={styles["field-help"]}>
        {t(
          "Choose a person, then send an invitation. Their email address stays private.",
        )}
      </p>
    </div>
  );
}
