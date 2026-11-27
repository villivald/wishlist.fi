import type { Metadata } from "next";
import { navigationPath } from "@/app/_navigation/navigation-path";
import { CardMedia, CardMediaLink } from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { CopyWishLink } from "@/components/cards/copy-wish-link";
import { WishCard, wishGridClassName } from "@/components/cards/wish-card";
import { WishCardFacts } from "@/components/cards/wish-card-facts";
import { createWishTones } from "@/components/cards/wish-tones";
import { ActionForm } from "@/components/form/action-form";
import { SuccessMessage } from "@/components/form/success-message";
import { Pagination } from "@/components/pagination";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { cancel } from "@/features/reservation/actions/manage-reservation";
import groupStyles from "@/features/reservation/components/groups.module.css";
import {
  EmptyReservations,
  ReservationHelp,
  ReservationsFrame,
} from "@/features/reservation/components/reservations-frame";
import { readGroupInvitations } from "@/features/reservation/service/groups";
import { readMyReservations } from "@/features/reservation/service/reservations";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import {
  listPath,
  reservationGroupPath,
  reservationsPath,
  wishPath,
} from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("My reservations"),
    robots: { index: false, follow: false },
  };
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    canceled?: string;
    invitationsPage?: string;
  }>;
}) {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const query = await searchParams;
  const [{ reservations, page, totalPages }, invitations] = await Promise.all([
    readMyReservations(user.id, Number(query.page ?? 1)),
    readGroupInvitations(user.id, Number(query.invitationsPage ?? 1)),
  ]);

  const tones = createWishTones(reservations.map(({ wish }) => wish.id));
  const pageUrl = (reservationPage: number, invitationPage: number) =>
    `${reservationsPath}?${new URLSearchParams({
      page: String(reservationPage),
      invitationsPage: String(invitationPage),
    })}`;

  return (
    <ReservationsFrame>
      <section
        className={
          invitations.invitations.length
            ? groupStyles.panel
            : groupStyles["empty-invitations"]
        }
        aria-labelledby="group-invitations-heading"
      >
        <h2 id="group-invitations-heading" tabIndex={-1}>
          {t("Group invitations")}
        </h2>
        {invitations.invitations.length ? (
          <ul className={styles["list-grid"]}>
            {invitations.invitations.map((invitation) => (
              <li key={invitation.id} className={styles["list-card"]}>
                <h3>{invitation.reservation.wish.title}</h3>
                <p>
                  {t("Invited by {name}", {
                    name:
                      invitation.inviter?.name ??
                      invitation.inviter?.username ??
                      "",
                  })}
                </p>
                <Link href={reservationGroupPath(invitation.reservationId)}>
                  {t("Review invitation")}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>{t("No pending group invitations.")}</p>
        )}
        <Pagination
          label={t("Group invitation pages")}
          page={invitations.page}
          total={invitations.totalPages}
          href={(target) =>
            `${pageUrl(page, target)}#group-invitations-heading`
          }
        />
      </section>
      {query.canceled === "1" && (
        <SuccessMessage queryKeys={["canceled"]}>
          {t("Reservation canceled.")}
        </SuccessMessage>
      )}
      {reservations.length ? (
        <ul
          className={wishGridClassName}
          id="reservation-results"
          tabIndex={-1}
          aria-label={t("My reservations")}
        >
          {reservations.map(({ id, wish, groupEnabled }) => (
            <WishCard key={id} tone={tones[wish.id]}>
              <CardMediaLink
                path={navigationPath(
                  wishPath(wish.wishlist.id, wish.id),
                  "reservations",
                )}
                title={wish.title}
              >
                <CardMedia image={wish.image} title={wish.title} />
              </CardMediaLink>
              <h2>
                <Link
                  href={navigationPath(
                    wishPath(wish.wishlist.id, wish.id),
                    "reservations",
                  )}
                >
                  {wish.title}
                </Link>
              </h2>
              <p className={cardStyles["wish-context"]}>
                {t("In")}{" "}
                <Link
                  href={navigationPath(
                    listPath(wish.wishlist.id),
                    "reservations",
                  )}
                >
                  {wish.wishlist.title}
                </Link>
              </p>
              <WishCardFacts
                priceMinor={wish.priceMinor}
                currency={wish.currency}
                priority={wish.priority}
              />
              <div
                className={`${groupStyles["card-footer"]} ${cardStyles["wish-actions"]}`}
              >
                <CopyWishLink
                  path={wishPath(wish.wishlist.id, wish.id)}
                  title={wish.title}
                  section="reservations"
                />
                {groupEnabled ? (
                  <Link
                    className={styles["secondary-button"]}
                    href={reservationGroupPath(id)}
                  >
                    {t("Manage group reservation")}
                  </Link>
                ) : (
                  <ActionForm
                    action={cancel.bind(null, wish.wishlist.id, wish.id, id)}
                    label={t("Cancel reservation")}
                    secondary
                    pendingLabel={t("Canceling…")}
                  >
                    <span className={styles["visually-hidden"]}>
                      {t("Cancel your reservation for")} {wish.title}
                    </span>
                  </ActionForm>
                )}
              </div>
            </WishCard>
          ))}
        </ul>
      ) : (
        <EmptyReservations page={page} />
      )}
      <Pagination
        label={t("Reservation pages")}
        page={page}
        total={totalPages}
        href={(target) =>
          `${pageUrl(target, invitations.page)}#reservation-results`
        }
      />
      <ReservationHelp />
    </ReservationsFrame>
  );
}
