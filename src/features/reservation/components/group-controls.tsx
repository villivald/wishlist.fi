import { ChevronDown, Mail, UsersRound } from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import {
  manageGroup,
  reserveWithGroup,
  startGroup,
} from "../actions/manage-group";
import groupStyles from "./groups.module.css";

export function GroupConsent({ organizer = false }: { organizer?: boolean }) {
  const t = useText();
  return (
    <label className={groupStyles.consent}>
      <input type="checkbox" name="confirm" required />
      <span>
        {t(
          organizer
            ? "Share my name and username with invitees and people who join this group."
            : "Share my name and username with the people who join this group.",
        )}
      </span>
    </label>
  );
}

export function StartGroup({
  reservationId,
  listId,
  wishId,
}: {
  reservationId?: string;
  listId: string;
  wishId: string;
}) {
  const t = useText();
  return (
    <details className={groupStyles.disclosure}>
      <summary>
        <UsersRound size={20} aria-hidden="true" />
        <span>{t("Reserve with others")}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className={groupStyles["disclosure-content"]}>
        <p className={styles.muted}>
          {t(
            "You coordinate the gift. Invite people after reserving; they choose whether to join. No payment is collected.",
          )}
        </p>
        <ActionForm
          action={
            reservationId
              ? startGroup.bind(null, reservationId)
              : reserveWithGroup.bind(null, listId, wishId)
          }
          label={t("Start group reservation")}
          pendingLabel={t("Updating…")}
          requireConfirmation
        >
          <GroupConsent organizer />
        </ActionForm>
      </div>
    </details>
  );
}

export function GroupAction({
  id,
  operation,
  targetId,
  label,
  confirmation,
  destructive = false,
  children,
}: {
  id: string;
  operation:
    | "invite"
    | "accept"
    | "decline"
    | "remove"
    | "leave"
    | "transfer"
    | "cancel";
  targetId?: string;
  label: string;
  confirmation?: string;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const t = useText();
  return (
    <ActionForm
      action={manageGroup.bind(null, id)}
      label={label}
      pendingLabel={t("Updating…")}
      icon={
        operation === "invite" ? (
          <Mail size={18} aria-hidden="true" />
        ) : undefined
      }
      destructive={destructive}
      secondary={
        !destructive && operation !== "accept" && operation !== "invite"
      }
      requireConfirmation={operation === "accept" || !!confirmation}
    >
      <input type="hidden" name="operation" value={operation} />
      {targetId && <input type="hidden" name="targetId" value={targetId} />}
      {operation === "accept" && <GroupConsent />}
      {confirmation && (
        <label className={groupStyles.consent}>
          <input type="checkbox" name="confirm" required />
          <span>{confirmation}</span>
        </label>
      )}
      {children}
    </ActionForm>
  );
}
