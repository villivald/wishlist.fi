import { Clock, Eye, Info, Link2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ActionForm } from "@/components/form/action-form";
import { SuccessMessage } from "@/components/form/success-message";
import managementStyles from "@/components/list-management.module.css";
import { LocalTime } from "@/components/local-time";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { revokeLink } from "@/features/guest/actions/manage-links";
import { GuestLinkForm } from "@/features/guest/components/guest-link-form";
import { readGuestLinks } from "@/features/guest/service/links";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import sharingStyles from "@/features/sharing/components/sharing.module.css";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { accountPlanPath, guestLinksPath, sharingPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Guest links"),
    robots: { index: false, follow: false },
  };
}

export default async function GuestLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ page?: string; revoked?: string }>;
}) {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const { listId } = await params;
  const query = await searchParams;
  const list = await readGuestLinks(listId, user.id, query.page);
  if (!list) notFound();
  const access = await readPremiumAccess(list.ownerId!);
  const visible = list.publication === "PUBLISHED";

  return (
    <div className={managementStyles.page}>
      <header className={managementStyles.header}>
        <BackLink href={sharingPath(listId)}>
          {t("Back to sharing and members")}
        </BackLink>
        <h1>{t("Guest links")}</h1>
        <p className={styles.description}>{list.title}</p>
        <p className={styles.muted}>
          {t("Let someone view your wishes without creating an account.")}
        </p>
      </header>
      {!visible && (
        <p className={styles.notice}>
          {t("This list is hidden, so guest links cannot open it yet.")}{" "}
          <Link href={`${sharingPath(listId)}#list-access-heading`}>
            {t("Go to list access and choose Publish list")}
          </Link>
          .
        </p>
      )}
      {query.revoked === "1" && (
        <SuccessMessage queryKeys={["revoked"]}>
          {t(
            "Guest link disabled. It no longer opens this list or its images.",
          )}
        </SuccessMessage>
      )}

      <section
        className={managementStyles.panel}
        aria-labelledby="create-guest-link-heading"
      >
        <div className={managementStyles.heading}>
          <h2 id="create-guest-link-heading">
            <Link2 size={21} aria-hidden="true" /> {t("Create a guest link")}
          </h2>
          <p className={styles.muted}>
            {t(
              "Choose a name to recognize it later and how long it should work.",
            )}
          </p>
        </div>
        <p className={sharingStyles.hint}>
          <Eye size={18} aria-hidden="true" />{" "}
          {t(
            "View only: guests cannot reserve gifts, edit wishes, or join the list.",
          )}
        </p>
        <p className={styles.muted}>
          {t(
            "To let someone reserve wishes, send an email invitation instead. They can create a Free account and verify their email. To let them edit the list too, invite them as an admin.",
          )}{" "}
          <Link href={sharingPath(listId)}>{t("Invite someone")}</Link>
        </p>
        {access.plan === "PREMIUM" ? (
          <GuestLinkForm
            key={list.guestLinks
              .filter((link) => link.revokedAt)
              .map((link) => link.id)
              .join(",")}
            listId={listId}
          />
        ) : (
          <p className={styles.notice}>
            {t(
              "The owner needs Premium to create links. Existing links keep their expiry dates and can still be disabled.",
            )}{" "}
            {list.ownerId === user.id && (
              <Link href={accountPlanPath}>{t("View your plan")}</Link>
            )}
          </p>
        )}
      </section>

      <section
        className={managementStyles.panel}
        aria-labelledby="guest-links-heading"
      >
        <div className={managementStyles.heading}>
          <h2 id="guest-links-heading">
            <Clock size={21} aria-hidden="true" /> {t("Your links")}
          </h2>
          <p className={styles.muted}>
            {t(
              "Link addresses are shown only when created. You can share a saved link again while it is active. If you no longer have the address, create a new link.",
            )}
          </p>
        </div>
        {list.guestLinks.length ? (
          <ul className={sharingStyles.resources}>
            {list.guestLinks.map((link) => {
              const expired = link.expiresAt <= new Date();
              const active = !link.revokedAt && !expired;
              return (
                <li className={sharingStyles.row} key={link.id}>
                  <div className={sharingStyles.identity}>
                    <span className={sharingStyles.avatar} aria-hidden="true">
                      <Link2 size={20} />
                    </span>
                    <div>
                      <h3>{link.label}</h3>
                      <p className={styles.muted}>
                        {link.revokedAt
                          ? t("Disabled")
                          : expired
                            ? t("Expired")
                            : visible
                              ? t("Active")
                              : t("Waiting for list to be visible")}
                      </p>
                      <p className={styles.muted}>
                        {expired ? t("Expired") : t("Expires")}{" "}
                        <LocalTime value={link.expiresAt.toISOString()} />
                      </p>
                    </div>
                  </div>
                  {active && (
                    <ActionForm
                      action={revokeLink.bind(null, listId, link.id)}
                      label={t("Disable link")}
                      secondary
                      pendingLabel={t("Disabling…")}
                    >
                      {null}
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.muted}>
            {list.page > 1
              ? t("No links on this page.")
              : access.plan === "PREMIUM"
                ? t(
                    "No guest links yet. Create one above and copy it to share.",
                  )
                : t("No guest links yet.")}
          </p>
        )}
        {(list.page > 1 || list.hasNextPage) && (
          <nav className={styles.actions} aria-label={t("Guest link pages")}>
            {list.page > 1 && (
              <Link href={`${guestLinksPath(listId)}?page=${list.page - 1}`}>
                {t("Previous page")}
              </Link>
            )}
            <span>
              {t("Page")} {list.page}
            </span>
            {list.hasNextPage && (
              <Link href={`${guestLinksPath(listId)}?page=${list.page + 1}`}>
                {t("Next page")}
              </Link>
            )}
          </nav>
        )}
      </section>
      <details className={styles.disclosure}>
        <summary>{t("What guests can see and how to end access")}</summary>
        <p>
          {t(
            "Guests see only available wishes. Hidden, fulfilled, and reserved wishes stay hidden, even if an admin opens the guest link.",
          )}
        </p>
        <p>
          {t(
            "Anyone with a link can use or forward it. Disable link stops that link for everyone. Removing a member does not disable links they already have.",
          )}
        </p>
        <p className={sharingStyles.hint}>
          <Info size={18} aria-hidden="true" />{" "}
          {t(
            "Hiding the list stops all guest access. Showing it again restores links that are still active; expiry dates do not change.",
          )}
        </p>
      </details>
    </div>
  );
}
