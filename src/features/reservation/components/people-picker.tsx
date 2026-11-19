"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "@/components/shell.module.css";
import { MediaImage } from "@/features/media/components/media-image";
import {
  type FavoriteRecipient,
  FavoriteRecipients,
} from "@/features/sharing/components/favorite-recipients";
import { useText } from "@/i18n/use-text";
import { searchPeople } from "../actions/search-people";
import { GroupAction } from "./group-controls";
import groupStyles from "./groups.module.css";
import { PersonName } from "./person-name";

type Person = Awaited<ReturnType<typeof searchPeople>>["people"][number];

function PersonIdentity({ person }: { person: Person }) {
  return (
    <span className={groupStyles.identity}>
      <span className={groupStyles.avatar} aria-hidden="true">
        {person.image ? (
          <MediaImage image={person.image} sizes="40px" />
        ) : (
          (person.name ?? person.username)
            .trim()
            .slice(0, 2)
            .toLocaleUpperCase()
        )}
      </span>
      <PersonName person={person} />
    </span>
  );
}

export function PeoplePicker({
  reservationId,
  favorites,
  privateList,
}: {
  reservationId: string;
  favorites: FavoriteRecipient[];
  privateList: boolean;
}) {
  const t = useText();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<Person | null>(null);
  const [result, setResult] = useState<{
    query: string;
    people: Person[];
    error: string | null;
  }>({ query: "", people: [], error: null });
  const trimmed = query.trim();
  const ready = trimmed.length >= 2;
  const loading = ready && result.query !== trimmed;
  const people = !ready || loading ? [] : result.people;
  const expanded = open && ready && !selected;

  useEffect(() => {
    if (trimmed.length < 2 || selected) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const response = await searchPeople(reservationId, trimmed);
        if (current) setResult({ query: trimmed, ...response });
      } catch {
        if (current)
          setResult({
            query: trimmed,
            people: [],
            error: "Something went wrong. Please try again.",
          });
      }
    }, 350);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [trimmed, reservationId, selected]);

  const choose = (person: Person) => {
    setEmail("");
    setSelected(person);
    setQuery(person.name ?? person.username);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };
  const status = loading
    ? t("Searching…")
    : result.error
      ? t.message(result.error)
      : people.length
        ? t("Select a person to invite.")
        : t(
            "No eligible people found. Previously invited people cannot be invited again to this reservation.",
          );

  return (
    <div className={groupStyles.picker}>
      <GroupAction
        id={reservationId}
        operation="invite"
        targetId={selected?.id}
        label={
          selected
            ? t("Invite {name}", { name: selected.name ?? selected.username })
            : t("Send invitation")
        }
      >
        <FavoriteRecipients
          favorites={favorites}
          selectedId={selected?.id}
          onSelect={(person) => {
            setSelected(person ? { ...person, image: null } : null);
            setEmail("");
            setQuery("");
            setOpen(false);
            setActive(-1);
          }}
        />
        <div className={styles.field}>
          <label htmlFor={`${id}-email`}>
            {favorites.length ? t("Or invite by email") : t("Invitation email")}
          </label>
          <input
            id={`${id}-email`}
            ref={emailInput}
            name="email"
            type="email"
            autoComplete="off"
            spellCheck={false}
            required={!selected}
            maxLength={254}
            aria-describedby={`${id}-email-help`}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSelected(null);
              setQuery("");
              setOpen(false);
              setActive(-1);
            }}
          />
          <p id={`${id}-email-help`} className={styles["field-help"]}>
            {privateList
              ? t(
                  "Use the verified email address of someone who already belongs to this private list.",
                )
              : t(
                  "Use the verified email address of a list member or someone with a public profile.",
                )}
          </p>
        </div>
        <details
          className={styles.disclosure}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setOpen(false);
          }}
        >
          <summary>{t("Search by name")}</summary>
          <div className={styles.field}>
            <label htmlFor={id}>{t("Name or username")}</label>
            <div className={groupStyles["search-input"]}>
              <Search size={20} aria-hidden="true" />
              <input
                ref={input}
                id={id}
                role="combobox"
                type="text"
                autoComplete="off"
                maxLength={80}
                placeholder={t("Type a name to find people…")}
                value={query}
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={expanded ? `${id}-results` : undefined}
                aria-activedescendant={
                  expanded && people[active]
                    ? `${id}-person-${people[active].id}`
                    : undefined
                }
                aria-describedby={`${id}-help`}
                onFocus={() => setOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setEmail("");
                  setSelected(null);
                  setActive(-1);
                  setOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setOpen(false);
                    setActive(-1);
                  }
                  if (
                    (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                    ready &&
                    !selected
                  ) {
                    event.preventDefault();
                    setOpen(true);
                    const index =
                      event.key === "ArrowDown"
                        ? Math.min(active + 1, people.length - 1)
                        : Math.max(active - 1, 0);
                    setActive(index);
                    if (people[index])
                      document
                        .getElementById(`${id}-person-${people[index].id}`)
                        ?.scrollIntoView({ block: "nearest" });
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (expanded && people[active]) choose(people[active]);
                  }
                }}
              />
            </div>
            <p id={`${id}-help`} className={styles["field-help"]}>
              {t(
                "Type at least two characters, then select a person and send an invitation.",
              )}
            </p>
          </div>
          {expanded && (
            <div className={groupStyles.results}>
              <p role="status" className={groupStyles["search-status"]}>
                {status}
              </p>
              <ul
                id={`${id}-results`}
                role="listbox"
                aria-label={t("People to invite")}
                aria-busy={loading}
              >
                {people.map((person, index) => (
                  <li
                    key={person.id}
                    id={`${id}-person-${person.id}`}
                    role="option"
                    tabIndex={-1}
                    aria-selected={active === index}
                    onPointerDown={(event) => {
                      if (event.pointerType === "mouse") event.preventDefault();
                    }}
                    onClick={() => choose(person)}
                  >
                    <PersonIdentity person={person} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
        {selected &&
          !favorites.some((favorite) => favorite.id === selected.id) && (
            <div className={groupStyles.selection}>
              <div className={groupStyles["selected-person"]}>
                <PersonIdentity person={selected} />
                <button
                  type="button"
                  className={groupStyles.clear}
                  aria-label={t("Clear selection")}
                  onClick={() => {
                    setSelected(null);
                    setQuery("");
                    setActive(-1);
                    (input.current?.closest("details")?.open
                      ? input.current
                      : emailInput.current
                    )?.focus();
                  }}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
      </GroupAction>
    </div>
  );
}
