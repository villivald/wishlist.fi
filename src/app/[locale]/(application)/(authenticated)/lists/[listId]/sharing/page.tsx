import { Eye, Link2, Mail, Shield, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyLink } from "@/components/cards/copy-link";
import { ListStatus } from "@/components/cards/list-status";
import { ActionForm } from "@/components/form/action-form";
import { SuccessMessage } from "@/components/form/success-message";
import managementStyles from "@/components/list-management.module.css";
import { ListManagementNavigation } from "@/components/list-management-navigation";
import { LocalTime } from "@/components/local-time";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { cancelInvitation } from "@/features/sharing/actions/manage-sharing";
import { AudienceControl } from "@/features/sharing/components/audience-control";
import { InvitationForm } from "@/features/sharing/components/invitation-form";
import { MemberAccess } from "@/features/sharing/components/member-access";
import sharingStyles from "@/features/sharing/components/sharing.module.css";
import { readSharing } from "@/features/sharing/service/queries";
import { PublicationControl } from "@/features/wishlist/components/publication-control";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import {
  accountPlanPath,
  guestLinksPath,
  listPath,
  sharingPath,
} from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("List access"),
    robots: { index: false, follow: false },
  };
}

export default async function SharingPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{
    members?: string;
    invitations?: string;
    changed?: string;
  }>;
}) {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const { listId } = await params;
  const query = await searchParams;
  const list = await readSharing(
    listId,
    user.id,
    query.members,
    query.invitations,
  );
  if (!list) notFound();

  const isOwner = list.ownerId === user.id;
  const isPrivate = list.visibility === "PRIVATE";
  const visible = list.publication === "PUBLISHED";
  const pageUrl = (members: number, invitations: number) =>
    `${sharingPath(listId)}?${new URLSearchParams({ members: String(members), invitations: String(invitations) })}`;

  return (
    <div className={managementStyles.page}>
      <header className={managementStyles.header}>
        <ListManagementNavigation listId={listId} current="access" />
        <h1>{t("List access")}</h1>
        <p className={styles.description}>{list.title}</p>
      </header>
      {query.changed === "removed" && (
        <SuccessMessage queryKeys={["changed"]}>
          {t(
            "Member removed. Access through a public list or a guest link is separate.",
          )}
        </SuccessMessage>
      )}
      {query.changed === "revoked" && (
        <SuccessMessage queryKeys={["changed"]}>
          {t("Invitation canceled.")}
        </SuccessMessage>
      )}
      {query.changed === "transferred" && (
        <SuccessMessage queryKeys={["changed"]}>
          {t("Ownership transferred. You remain an admin.")}
        </SuccessMessage>
      )}

      <section
        className={managementStyles.panel}
        aria-labelledby="list-access-heading"
      >
        <h2 id="list-access-heading" className={sharingStyles["section-title"]}>
          <Eye size={21} aria-hidden="true" />{" "}
          <span>{t("Who can view this list?")}</span>
        </h2>
        <div className={sharingStyles.access}>
          <div className={sharingStyles["access-summary"]}>
            <ListStatus
              publication={list.publication}
              visibility={list.visibility}
            />
            <p className={styles.muted}>
              {!visible
                ? t(
                    "Only admins can open this list. Choose Show list on the list page when you’re ready.",
                  )
                : isPrivate
                  ? t(
                      "Members can open this list with their account. Active guest links give view-only access.",
                    )
                  : t(
                      "Anyone can find this list in Browse or open its public link. No account is needed to view it.",
                    )}
            </p>
          </div>
          {visible && !isPrivate && (
            <CopyLink path={listPath(listId)} title={list.title} />
          )}
        </div>
        <AudienceControl
          listId={listId}
          visibility={list.visibility}
          premium={list.premium}
        />
        <div className={sharingStyles["access-next"]}>
          <p>
            {isPrivate
              ? t(
                  "Choose people below. Only accepted members can sign in to view this list.",
                )
              : t(
                  "Inviting people does not restrict access. Choose Selected people to make this list private.",
                )}
          </p>
          <Link href="#invite-heading">{t("Invite people")}</Link>
        </div>
        {list._count.guestLinks > 0 && (
          <p className={styles.notice}>
            {t(
              "Active guest links: {count}. Anyone with one can still view this list when it is published.",
              { count: list._count.guestLinks },
            )}{" "}
            <Link href={guestLinksPath(listId)}>
              {t("Review or disable guest links")}
            </Link>
          </p>
        )}
        {!visible && (
          <div className={sharingStyles["access-next"]}>
            <p>
              {t(
                "This list is hidden. Publish it when you are ready for your chosen audience to see it.",
              )}
            </p>
            <PublicationControl id={listId} visible={false} />
          </div>
        )}
      </section>

      {!list.premium && (
        <p className={styles.notice}>
          {t(
            "The owner needs Premium for new invitations, guest links, and admin roles. Existing access stays available.",
          )}{" "}
          {isOwner && <Link href={accountPlanPath}>{t("View your plan")}</Link>}
        </p>
      )}

      <section
        className={managementStyles.panel}
        aria-labelledby="invite-heading"
      >
        <div className={managementStyles.heading}>
          <h2 id="invite-heading" className={sharingStyles["section-title"]}>
            <Mail size={21} aria-hidden="true" />{" "}
            <span>{t("Invite people")}</span>
          </h2>
          <p className={styles.muted}>
            {t(
              "They join with an account and can reserve gifts when reservations are enabled.",
            )}
          </p>
        </div>
        <p className={styles.notice}>
          {!visible
            ? t(
                "This list is hidden. Invited members can view it after you show the list.",
              )
            : isPrivate
              ? t(
                  "Invited people need to accept their invitation before viewing. Guest-link access is separate.",
                )
              : t(
                  "This list is public. Invitations do not limit who can view it. Save Selected people above to restrict access.",
                )}
        </p>
        {list.premium ? (
          <InvitationForm
            favorites={list.favorites}
            listId={listId}
            previousRecipients={list.previousRecipients}
          />
        ) : (
          <p className={styles.muted}>
            {t("Invitations are available when the owner has Premium.")}
          </p>
        )}
      </section>

      <section
        className={managementStyles.panel}
        aria-labelledby="invitations-heading"
      >
        <div className={managementStyles.heading}>
          <h2
            id="invitations-heading"
            className={sharingStyles["section-title"]}
          >
            <Mail size={21} aria-hidden="true" />{" "}
            <span>{t("Pending invitations")}</span>
          </h2>
          <p className={styles.muted}>
            {t(
              "People appear as members after they accept. Invitations expire after seven days.",
            )}
          </p>
        </div>
        {list.invitations.length ? (
          <ul className={sharingStyles.resources}>
            {list.invitations.map((invitation) => (
              <li key={invitation.id} className={sharingStyles.row}>
                <div className={sharingStyles.identity}>
                  <span className={sharingStyles.avatar} aria-hidden="true">
                    <Mail size={20} />
                  </span>
                  <div>
                    <h3>
                      {invitation.recipient?.name ??
                        invitation.recipient?.username ??
                        invitation.email}
                    </h3>
                    {invitation.recipient && (
                      <p className={styles.muted}>
                        @{invitation.recipient.username}
                      </p>
                    )}
                    <p className={styles.muted}>
                      {invitation.role === "ADMIN" ? t("Admin") : t("Member")} ·{" "}
                      {invitation.expiresAt <= new Date()
                        ? t("Expired")
                        : invitation.deliveryFailedAt
                          ? t("Email not delivered — cancel and invite again")
                          : invitation.sentAt
                            ? t("Email sent")
                            : t("Email is being sent")}
                    </p>
                    <p className={styles.muted}>
                      {invitation.expiresAt <= new Date()
                        ? t("Expired")
                        : t("Expires")}{" "}
                      <LocalTime value={invitation.expiresAt.toISOString()} />
                    </p>
                  </div>
                </div>
                <ActionForm
                  action={cancelInvitation.bind(null, listId, invitation.id)}
                  label={t("Cancel invitation")}
                  pendingLabel={t("Canceling…")}
                  secondary
                >
                  {null}
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>
            {list.invitationsPage > 1
              ? t("No invitations on this page.")
              : list.premium
                ? t("No pending invitations. Send one above to get started.")
                : t("No pending invitations.")}
          </p>
        )}
        {(list.invitationsPage > 1 || list.moreInvitations) && (
          <nav className={styles.actions} aria-label={t("Invitation pages")}>
            {list.invitationsPage > 1 && (
              <Link href={pageUrl(list.membersPage, list.invitationsPage - 1)}>
                {t("Previous invitations")}
              </Link>
            )}
            <span>
              {t("Page")} {list.invitationsPage}
            </span>
            {list.moreInvitations && (
              <Link href={pageUrl(list.membersPage, list.invitationsPage + 1)}>
                {t("Next invitations")}
              </Link>
            )}
          </nav>
        )}
      </section>

      <section
        className={managementStyles.panel}
        aria-labelledby="members-heading"
      >
        <div className={managementStyles.heading}>
          <h2 id="members-heading" className={sharingStyles["section-title"]}>
            <Users size={21} aria-hidden="true" />{" "}
            <span>{t("People with access")}</span>{" "}
            <span className={sharingStyles.count}>
              {list._count.memberships}
            </span>
          </h2>
          <p className={styles.muted}>
            {t("Manage each person’s role or remove their membership.")}
            {list._count.memberships === 1 && (
              <>
                {" "}
                {t(
                  "Only you have joined so far. Invite someone above to share this list.",
                )}
              </>
            )}
          </p>
        </div>
        <ul className={sharingStyles.resources}>
          {list.memberships.map((member) => (
            <MemberAccess
              key={member.id}
              member={member}
              listId={listId}
              ownerId={list.ownerId}
              viewerId={user.id}
              premium={list.premium}
            />
          ))}
        </ul>
        <details className={sharingStyles["role-help"]}>
          <summary>{t("About roles and ownership")}</summary>
          <div className={sharingStyles["role-help-body"]}>
            <p>
              <strong>{t("Members")}</strong>{" "}
              {t(
                "can view available wishes and reserve gifts when enabled. They cannot open hidden lists.",
              )}
            </p>
            <p>
              <strong>{t("Admins")}</strong>{" "}
              {t(
                "can edit wishes and settings, invite people, and manage access. Some changes need the owner’s Premium plan.",
              )}
            </p>
            <p>
              <Shield size={16} aria-hidden="true" />{" "}
              <strong>{t("The owner")}</strong>{" "}
              {t(
                "is also an admin. Only the owner can transfer the list to another admin, and must do that before leaving.",
              )}
            </p>
          </div>
        </details>
        {(list.membersPage > 1 || list.moreMembers) && (
          <nav className={styles.actions} aria-label={t("Member pages")}>
            {list.membersPage > 1 && (
              <Link href={pageUrl(list.membersPage - 1, list.invitationsPage)}>
                {t("Previous members")}
              </Link>
            )}
            <span>
              {t("Page")} {list.membersPage}
            </span>
            {list.moreMembers && (
              <Link href={pageUrl(list.membersPage + 1, list.invitationsPage)}>
                {t("Next members")}
              </Link>
            )}
          </nav>
        )}
      </section>
      <section
        className={`${managementStyles.panel} ${sharingStyles["guest-section"]}`}
        aria-labelledby="guest-access-heading"
      >
        <div className={managementStyles.heading}>
          <h2
            id="guest-access-heading"
            className={sharingStyles["section-title"]}
          >
            <Link2 size={21} aria-hidden="true" />{" "}
            <span>{t("Guest links")}</span>
          </h2>
          <p>
            {t(
              "Guests cannot reserve gifts or edit the list. Links have an expiry date and can be disabled.",
            )}
          </p>
        </div>
        <Link
          href={guestLinksPath(listId)}
          className={styles["secondary-button"]}
        >
          {t("Manage guest links")}
        </Link>
      </section>
    </div>
  );
}
