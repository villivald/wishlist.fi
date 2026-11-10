import type { Metadata } from "next";
import { ActionForm } from "@/components/form/action-form";
import { LocalTime } from "@/components/local-time";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { joinList } from "@/features/sharing/actions/manage-sharing";
import { readInvitation } from "@/features/sharing/service/invitations";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { invitationPath, listsPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("List invitation"),
    robots: { index: false, follow: false },
  };
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ invitationId: string }>;
}) {
  const t = await getText();

  const { invitationId } = await params;
  const { user } = await getAuthOrRedirect({
    returnTo: invitationPath(invitationId),
  });
  const invitation = await readInvitation(invitationId, user.id);
  return (
    <section className={styles.editor}>
      <h1>{t("List invitation")}</h1>
      {invitation ? (
        <>
          <p>
            {t("Invited by")} {invitation.invitedBy}.
          </p>
          <p>
            {t("You have been invited as")}{" "}
            {invitation.role === "ADMIN"
              ? t("an admin who can manage content and people")
              : t("a member who can view and reserve available wishes")}
            {t(
              ". Hidden lists are visible only to admins. Reservations must be enabled by the list admins.",
            )}
          </p>
          <p>
            {t("Expires")}{" "}
            <LocalTime value={invitation.expiresAt.toISOString()} />.
          </p>
          {invitation.canAccept ? (
            <ActionForm
              requireConfirmation
              action={joinList.bind(null, invitation.id)}
              label={t("Join list")}
              pendingLabel={t("Joining…")}
            >
              <label className={styles["checkbox-label"]}>
                <input type="checkbox" name="confirm" value="yes" required />
                {t(
                  "I want to join this list. Its admins will see my username and membership role.",
                )}
              </label>
            </ActionForm>
          ) : (
            <p>
              {t(
                "The list owner needs active Premium before you can join. Contact the person who invited you.",
              )}
            </p>
          )}
        </>
      ) : (
        <p>
          {t(
            "This invitation is unavailable. Sign in with the invited email or ask the list admin for a new invitation.",
          )}
        </p>
      )}
      <Link href={`${listsPath}?shared=1`}>{t("Lists shared with you")}</Link>
    </section>
  );
}
