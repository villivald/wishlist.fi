import {
  ArrowRightLeft,
  Shield,
  UserRound,
  UserRoundMinus,
} from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import styles from "@/components/shell.module.css";
import { useText } from "@/i18n/use-text";
import {
  deleteMembership,
  transferList,
  updateMemberRole,
} from "../actions/manage-sharing";
import type { readSharing } from "../service/queries";
import sharingStyles from "./sharing.module.css";

type Member = NonNullable<
  Awaited<ReturnType<typeof readSharing>>
>["memberships"][number];

export function MemberAccess({
  member,
  listId,
  ownerId,
  viewerId,
  premium,
  hidden,
}: {
  member: Member;
  listId: string;
  ownerId: string | null;
  viewerId: string;
  premium: boolean;
  hidden: boolean;
}) {
  const t = useText();

  const owner = member.userId === ownerId;
  const self = member.userId === viewerId;
  const admin = member.role === "ADMIN";
  const name = member.user.username;

  return (
    <li className={sharingStyles.row}>
      <div className={sharingStyles.identity}>
        <span className={sharingStyles.avatar} aria-hidden="true">
          {name.slice(0, 1).toLocaleUpperCase(t.locale)}
        </span>
        <div>
          <h3>
            {name}{" "}
            {self && (
              <span className={sharingStyles["self-marker"]}>{t("You")}</span>
            )}
          </h3>
          <p className={styles.muted}>
            {owner ? t("Owner · Admin") : admin ? t("Admin") : t("Member")}
          </p>
          <p className={styles.muted}>
            {t(
              admin
                ? "Can view and edit"
                : hidden
                  ? "Viewing blocked while hidden"
                  : "Can view",
            )}
          </p>
        </div>
      </div>
      {owner ? (
        <p className={sharingStyles["row-note"]}>
          {self ? t("You own this list.") : t("Owns this list.")}
        </p>
      ) : (
        <details className={sharingStyles.management}>
          <summary>
            {t("Manage access")}
            <span className={styles["visually-hidden"]}>
              {t("Manage access for {name}", { name })}
            </span>
          </summary>
          <div className={sharingStyles.controls}>
            {(admin || premium) && (
              <ActionForm
                requireConfirmation
                action={updateMemberRole.bind(null, listId, member.id)}
                label={admin ? t("Make member") : t("Make admin")}
                secondary
                pendingLabel={t("Updating…")}
                icon={
                  admin ? (
                    <UserRound size={18} aria-hidden="true" />
                  ) : (
                    <Shield size={18} aria-hidden="true" />
                  )
                }
              >
                <input
                  type="hidden"
                  name="role"
                  value={admin ? "MEMBER" : "ADMIN"}
                />
                <label className={styles["checkbox-label"]}>
                  <input type="checkbox" name="confirm" value="yes" required />
                  {admin
                    ? t(
                        "{value0} will lose admin controls. Invitations they sent that have not been accepted will be canceled.",
                        { value0: name },
                      )
                    : t(
                        "{value0} will be able to edit wishes, change settings, and manage members.",
                        { value0: name },
                      )}
                </label>
              </ActionForm>
            )}
            <ActionForm
              requireConfirmation
              action={deleteMembership.bind(null, listId, member.id)}
              label={self ? t("Leave list") : t("Remove member")}
              pendingLabel={t("Removing…")}
              destructive
              icon={<UserRoundMinus size={18} aria-hidden="true" />}
            >
              <label className={styles["checkbox-label"]}>
                <input type="checkbox" name="confirm" value="yes" required />
                {self
                  ? t(
                      "Remove my membership. I will lose private access and any reservations that require it.",
                    )
                  : t(
                      "Remove {name} as a member. Their membership access and reservations that depend on it will end. Public lists and guest links remain separate.",
                      { name },
                    )}
              </label>
            </ActionForm>
            {viewerId === ownerId && admin && (
              <details className={sharingStyles.transfer}>
                <summary>{t("Transfer ownership")}</summary>
                <ActionForm
                  requireConfirmation
                  action={transferList.bind(null, listId, member.id)}
                  label={t("Transfer ownership")}
                  pendingLabel={t("Transferring…")}
                  icon={<ArrowRightLeft size={18} aria-hidden="true" />}
                >
                  <label className={styles["checkbox-label"]}>
                    <input
                      type="checkbox"
                      name="confirm"
                      value="yes"
                      required
                    />
                    {t(
                      "Transfer ownership to {name}. I will remain an admin, but only the new owner can transfer it back. Their Premium plan will apply to this list.",
                      { name },
                    )}
                  </label>
                </ActionForm>
              </details>
            )}
          </div>
        </details>
      )}
    </li>
  );
}
