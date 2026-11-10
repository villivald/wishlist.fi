import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { GroupAction } from "@/features/reservation/components/group-controls";
import groupStyles from "@/features/reservation/components/groups.module.css";
import { PeoplePicker } from "@/features/reservation/components/people-picker";
import { PersonName } from "@/features/reservation/components/person-name";
import {
  GROUP_LIMIT,
  readReservationGroup,
} from "@/features/reservation/service/groups";
import { WishPriority } from "@/features/wish/components/wish-priority";
import { formatWishPrice } from "@/features/wish/utils/money";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { reservationsPath, wishPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Group reservation"),
    robots: { index: false, follow: false },
  };
}

export default async function GroupPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { user } = await getAuthOrRedirect();
  const { reservationId } = await params;
  const group = await readReservationGroup(user.id, reservationId);
  if (!group) notFound();
  const t = await getText();
  const enabled = group.wish.wishlist.reservationsEnabled;
  return (
    <section className={styles.page}>
      <Link href={reservationsPath}>{t("View my reservations")}</Link>
      <div className={styles["page-heading"]}>
        <div>
          <h1>{t("Group reservation")}</h1>
          <p className={styles.muted}>
            {t("Coordinate a gift together. No payment is collected.")}
          </p>
        </div>
      </div>
      <section
        className={groupStyles.panel}
        aria-labelledby="group-wish-heading"
      >
        <h2 id="group-wish-heading">{group.wish.title}</h2>
        <p>
          {t("In")} {group.wish.wishlist.title}
        </p>
        <p className={styles.price}>
          {formatWishPrice(group.wish.priceMinor, group.wish.currency, t)}
        </p>
        <WishPriority priority={group.wish.priority} />
        {group.wish.description && (
          <p className={styles.description}>{group.wish.description}</p>
        )}
        {!group.pending && (
          <Link
            href={`${wishPath(group.wish.wishlistId, group.wish.id)}?from=reservations`}
          >
            {t("View wish")}
          </Link>
        )}
        <p>
          {t.plural(
            "{count} person has joined, including the organizer.",
            "{count} people have joined, including the organizer.",
            group.size,
          )}
        </p>
      </section>
      {!enabled && (
        <p role="status">
          {t(
            "New group invitations and acceptance are disabled for this list.",
          )}
        </p>
      )}
      {group.pending ? (
        <section
          className={groupStyles.panel}
          aria-labelledby="group-invitation-heading"
        >
          <h2 id="group-invitation-heading">{t("Invitation to join")}</h2>
          <p>
            {t("Invited by {name}", {
              name: group.inviter?.name ?? group.inviter?.username ?? "",
            })}{" "}
            {group.inviter?.name &&
              group.inviter.name.toLowerCase() !==
                group.inviter.username.toLowerCase() && (
                <span className={styles.muted}>@{group.inviter.username}</span>
              )}
          </p>
          <p>
            {t(
              "Joining shares your name and username with the organizer and accepted participants. You can leave later. List admins see reservation status only unless they join too.",
            )}
          </p>
          {group.expiresAt && (
            <p>
              {t("Expires")}{" "}
              {new Intl.DateTimeFormat(t.locale, {
                dateStyle: "medium",
              }).format(group.expiresAt)}
            </p>
          )}
          {enabled && (
            <GroupAction
              id={group.id}
              operation="accept"
              label={t("Accept invitation")}
            />
          )}
          <GroupAction
            id={group.id}
            operation="decline"
            label={t("Decline invitation")}
          />
        </section>
      ) : (
        <>
          <section
            className={groupStyles.panel}
            aria-labelledby="group-people-heading"
          >
            <h2 id="group-people-heading">{t("Group members")}</h2>
            <p className={styles.muted}>
              {t(
                "Only people who join this group can see its members. Invitations never grant access to a private list.",
              )}
            </p>
            <ul className={groupStyles.people}>
              {group.people.map((person) => (
                <li key={person.id}>
                  <div>
                    <PersonName person={person} />
                    {person.organizer && <p>{t("Organizer")}</p>}
                  </div>
                  {group.organizer && !person.organizer && (
                    <div className={groupStyles.controls}>
                      <GroupAction
                        id={group.id}
                        operation="remove"
                        targetId={person.id}
                        label={t("Remove from group")}
                      />
                      <details className={styles.disclosure}>
                        <summary>{t("Transfer coordination")}</summary>
                        <GroupAction
                          id={group.id}
                          operation="transfer"
                          targetId={person.id}
                          label={t("Transfer coordination")}
                          confirmation={t(
                            "Make {name} the organizer. I will remain a participant. Pending invitations will be canceled.",
                            { name: person.name ?? person.username },
                          )}
                        />
                      </details>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {group.organizer && (
            <section
              className={groupStyles.panel}
              aria-labelledby="group-invite-heading"
            >
              <h2 id="group-invite-heading">{t("Invite people")}</h2>
              <p className={styles.muted}>
                {t(
                  "Search public profiles or list members. Invitations expire after seven days. We email invitees and notify you by email when they join.",
                )}
              </p>
              <p>
                {t(
                  "{count} of 10 places used, including pending invitations.",
                  { count: group.occupied },
                )}
              </p>
              {enabled && group.occupied < GROUP_LIMIT && (
                <PeoplePicker
                  key={group.invitations.map((person) => person.id).join(":")}
                  reservationId={group.id}
                />
              )}
              {!!group.invitations.length && (
                <>
                  <h3>{t("Pending invitations")}</h3>
                  <ul className={groupStyles.people}>
                    {group.invitations.map((person) => (
                      <li key={person.id}>
                        <div>
                          <PersonName person={person} />
                          <p>
                            {t("Expires")}{" "}
                            {new Intl.DateTimeFormat(t.locale, {
                              dateStyle: "medium",
                            }).format(person.expiresAt)}
                          </p>
                        </div>
                        <GroupAction
                          id={group.id}
                          operation="remove"
                          targetId={person.id}
                          label={t("Cancel invitation")}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <section
            className={groupStyles.panel}
            aria-labelledby="group-leave-heading"
          >
            <h2 id="group-leave-heading">{t("Leaving the group")}</h2>
            {group.organizer ? (
              <>
                <p>
                  {t(
                    "Transfer coordination to an accepted participant before leaving, or cancel this reservation for everyone.",
                  )}
                </p>
                <GroupAction
                  id={group.id}
                  operation="cancel"
                  label={t("Cancel group reservation")}
                  destructive
                  confirmation={t(
                    "End this reservation for everyone and cancel all pending invitations.",
                  )}
                />
              </>
            ) : (
              <GroupAction
                id={group.id}
                operation="leave"
                label={t("Leave group")}
              >
                <p>
                  {t(
                    "The reservation will continue for the other participants.",
                  )}
                </p>
              </GroupAction>
            )}
          </section>
        </>
      )}
    </section>
  );
}
