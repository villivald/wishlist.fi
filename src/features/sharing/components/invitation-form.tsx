"use client";
import { Check, Mail } from "lucide-react";
import { useActionState, useId, useRef, useState } from "react";
import { ActionFeedback } from "@/components/form/action-feedback";
import type { ActionState } from "@/components/form/utils/to-action-state";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import styles from "@/components/shell.module.css";
import { type ListAccess, listAccess } from "@/features/wishlist/list-access";
import { useText } from "@/i18n/use-text";
import { sendInvitation } from "../actions/manage-sharing";
import {
  type FavoriteRecipient,
  FavoriteRecipients,
} from "./favorite-recipients";
import sharingStyles from "./sharing.module.css";

type Recipient = { email: string; username: string };
type Suggestions = {
  favorites: FavoriteRecipient[];
  previousRecipients: Recipient[];
};
type Access = { access: ListAccess; guestLinks: number };

export function InvitationForm({
  listId,
  favorites = [],
  previousRecipients = [],
  publication,
  visibility,
  guestLinks,
}: {
  listId: string;
  publication: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "PRIVATE";
  guestLinks: number;
} & Partial<Suggestions>) {
  const [state, action, pending] = useActionState(
    sendInvitation.bind(null, listId),
    { ...EMPTY_ACTION_STATE, timestamp: 0 },
  );
  const id = useId();
  return (
    <form action={action} className={styles.form} aria-busy={pending}>
      <ActionFeedback state={state} />
      <InvitationFields
        key={state.timestamp}
        state={state}
        pending={pending}
        id={id}
        favorites={favorites}
        previousRecipients={previousRecipients}
        access={listAccess({ publication, visibility })}
        guestLinks={guestLinks}
      />
    </form>
  );
}

function InvitationFields({
  state,
  pending,
  id,
  favorites,
  previousRecipients,
  access,
  guestLinks,
}: {
  state: ActionState;
  pending: boolean;
  id: string;
} & Suggestions &
  Access) {
  const t = useText();
  const [email, setEmail] = useState(String(state.payload?.get("email") ?? ""));
  const [recipientId, setRecipientId] = useState(
    String(state.payload?.get("recipientId") ?? ""),
  );
  const selected = favorites.find((person) => person.id === recipientId);
  const emailInput = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState(
    String(state.payload?.get("role") ?? "MEMBER"),
  );
  const [shareAccess, setShareAccess] = useState(
    String(state.payload?.get("shareAccess") ?? "PRIVATE"),
  );
  const hiddenMember = access === "HIDDEN" && role === "MEMBER";
  const sharePrivately = hiddenMember && shareAccess === "PRIVATE";
  const inviteLabel = sharePrivately
    ? t("Share privately & invite")
    : hiddenMember
      ? t("Invite & keep hidden")
      : role === "ADMIN"
        ? t("Invite as admin")
        : t("Send invitation");
  return (
    <fieldset
      disabled={pending}
      className={`${styles["form-fields"]} ${sharingStyles["invitation-fields"]}`}
    >
      <legend className={styles["visually-hidden"]}>
        {t("Invite people")}
      </legend>
      <FavoriteRecipients
        favorites={favorites}
        selectedId={selected?.id}
        onSelect={(person) => {
          setRecipientId(person?.id ?? "");
          setEmail("");
        }}
      />
      {previousRecipients.length > 0 && (
        <div className={sharingStyles.suggestions}>
          <p id={`${id}-suggestions`}>{t("Previously invited by you")}</p>
          <div role="group" aria-labelledby={`${id}-suggestions`}>
            {previousRecipients.map((recipient) => (
              <button
                key={recipient.email}
                type="button"
                aria-pressed={!selected && email === recipient.email}
                className={sharingStyles.recipient}
                onClick={() => {
                  setRecipientId("");
                  setEmail(recipient.email);
                  emailInput.current?.focus();
                }}
              >
                <span className={sharingStyles.avatar} aria-hidden="true">
                  {recipient.username.slice(0, 1).toLocaleUpperCase(t.locale)}
                </span>
                <span className={sharingStyles["recipient-identity"]}>
                  <strong>{recipient.username}</strong>
                  <span>{recipient.email}</span>
                </span>
                {!selected && email === recipient.email && (
                  <Check size={18} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        className={
          selected
            ? sharingStyles["recipient-status"]
            : styles["visually-hidden"]
        }
        aria-live="polite"
        aria-atomic="true"
      >
        {selected && (
          <p className={sharingStyles["selected-recipient"]}>
            <Check size={20} aria-hidden="true" />
            {t("Invitation for @{username}", { username: selected.username })}
          </p>
        )}
      </div>
      <input type="hidden" name="recipientId" value={selected?.id ?? ""} />
      <input type="hidden" name="expectedAccess" value={access} />
      <div className={styles.field}>
        <label htmlFor={`${id}-email`}>
          {favorites.length ? t("Or invite by email") : t("Invitation email")}
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="off"
          spellCheck={false}
          required={!selected}
          maxLength={254}
          ref={emailInput}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setRecipientId("");
          }}
          aria-invalid={!!state.fieldErrors.email?.length}
          aria-describedby={`${id}-email-help`}
        />
        <p id={`${id}-email-help`} className={styles.muted}>
          {state.fieldErrors.email?.map(t.message).join(" ") ??
            t("They will need to verify this email before joining.")}
        </p>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-role`}>{t("Invitation role")}</label>
        <select
          id={`${id}-role`}
          name="role"
          aria-describedby={`${id}-role-help`}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="MEMBER">{t("Member")}</option>
          <option value="ADMIN">{t("Admin")}</option>
        </select>
        <p id={`${id}-role-help`} className={styles["field-help"]}>
          {role === "ADMIN"
            ? t("Can add and edit wishes, change settings, and manage access.")
            : t("Can view and reserve wishes when reservations are enabled.")}
        </p>
      </div>
      {hiddenMember ? (
        <fieldset className={sharingStyles["invitation-access"]}>
          <legend>
            {t("This list is hidden. How would you like to share it?")}
          </legend>
          {(["PRIVATE", "KEEP"] as const).map((value) => (
            <label key={value} className={sharingStyles.choice}>
              <input
                type="radio"
                name="shareAccess"
                value={value}
                checked={shareAccess === value}
                onChange={() => setShareAccess(value)}
                aria-labelledby={`${id}-share-${value}`}
                aria-describedby={`${id}-share-${value}-help`}
              />
              <span>
                <strong id={`${id}-share-${value}`}>
                  {value === "PRIVATE"
                    ? t("Share with invited people")
                    : t("Keep hidden for now")}
                </strong>
                <span id={`${id}-share-${value}-help`}>
                  {value === "PRIVATE"
                    ? t(
                        "They can open the list after accepting. It stays out of Browse.",
                      )
                    : t(
                        "Send the invitation now. They can view after you change list access.",
                      )}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="shareAccess" value="KEEP" />
      )}
      <div
        className={sharingStyles["invitation-impact"]}
        aria-live="polite"
        aria-atomic="true"
      >
        <p>
          {role === "ADMIN"
            ? t("Admins can open and edit this list even when it is hidden.")
            : sharePrivately
              ? t(
                  "This also makes the list available to all existing accepted members. Any active guest links will also allow viewing without signing in.",
                )
              : hiddenMember
                ? t(
                    "They can accept now, but cannot view until you change list access. This list stays hidden.",
                  )
                : access === "PUBLIC"
                  ? t(
                      "Anyone can already view this list. Accepting the invitation adds them as a member.",
                    )
                  : t(
                      "They can open this list with their account after accepting.",
                    )}
        </p>
        {sharePrivately && guestLinks > 0 && (
          <p>{t("Active guest links: {count}", { count: guestLinks })}</p>
        )}
      </div>
      <button className={styles.button} type="submit">
        <Mail size={18} aria-hidden="true" />
        {pending ? t("Inviting…") : inviteLabel}
      </button>
    </fieldset>
  );
}
