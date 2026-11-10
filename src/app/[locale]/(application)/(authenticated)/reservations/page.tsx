import type { Metadata } from "next";
import { navigationPath } from "@/app/_navigation/navigation-path";
import { CardMedia, CardMediaLink } from "@/components/cards/card-media";
import cardStyles from "@/components/cards/cards.module.css";
import { WishCard } from "@/components/cards/wish-card";
import { createWishTones } from "@/components/cards/wish-tones";
import { ActionForm } from "@/components/form/action-form";
import { SuccessMessage } from "@/components/form/success-message";
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
import { WishPriority } from "@/features/wish/components/wish-priority";
import { formatWishPrice } from "@/features/wish/utils/money";
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
  const [{ reservations, page, hasNextPage }, invitations] = await Promise.all([
    readMyReservations(user.id, Number(query.page ?? 1)),
    readGroupInvitations(user.id, Number(query.invitationsPage ?? 1)),
  ]);

  const tones = createWishTones(reservations.map(({ wish }) => wish.id));
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
        <h2 id="group-invitations-heading">{t("Group invitations")}</h2>
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
        {(invitations.page > 1 || invitations.hasNextPage) && (
          <nav
            className={styles.actions}
            aria-label={t("Group invitation pages")}
          >
            {invitations.page > 1 && (
              <Link
                href={`${reservationsPath}?invitationsPage=${invitations.page - 1}&page=${page}`}
              >
                {t("Previous page")}
              </Link>
            )}
            <span>
              {t("Page")} {invitations.page}
            </span>
            {invitations.hasNextPage && (
              <Link
                href={`${reservationsPath}?invitationsPage=${invitations.page + 1}&page=${page}`}
              >
                {t("Next page")}
              </Link>
            )}
          </nav>
        )}
      </section>
      {query.canceled === "1" && (
        <SuccessMessage queryKeys={["canceled"]}>
          {t("Reservation canceled.")}
        </SuccessMessage>
      )}
      {reservations.length ? (
        <ul className={styles["list-grid"]}>
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
              <p>
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
              <div className={cardStyles["wish-facts"]}>
                <p className={styles.price}>
                  {formatWishPrice(wish.priceMinor, wish.currency, t)}
                </p>
                <WishPriority priority={wish.priority} />
              </div>
              <div className={groupStyles["card-footer"]}>
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
      <ReservationHelp />
      {(page > 1 || hasNextPage) && (
        <nav className={styles.actions} aria-label={t("Reservation pages")}>
          {page > 1 && (
            <Link href={`${reservationsPath}?page=${page - 1}`}>
              {t("Previous page")}
            </Link>
          )}
          <span>
            {t("Page")} {page}
          </span>
          {hasNextPage && (
            <Link href={`${reservationsPath}?page=${page + 1}`}>
              {t("Next page")}
            </Link>
          )}
        </nav>
      )}
    </ReservationsFrame>
  );
}
