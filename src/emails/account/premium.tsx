import { languageTag } from "@/i18n/config";
import { createText } from "@/i18n/text";
import { accountPlanPath, listsPath } from "@/paths";
import {
  EmailAction,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailLink,
  EmailList,
  EmailNote,
  EmailParagraph,
  emailUrl,
} from "../components/layout";

export type PremiumEmailProps = {
  toName: string;
  locale?: string;
  source: "month" | "year" | "promo";
  startsAt: string;
  expiresAt: string;
};
export default function PremiumEmail({
  toName,
  locale = "en",
  source,
  startsAt,
  expiresAt,
}: PremiumEmailProps) {
  const t = createText(locale);
  const date = (value: string) =>
    new Intl.DateTimeFormat(languageTag(locale), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Helsinki",
    }).format(new Date(value));
  const promo = source === "promo";
  return (
    <EmailLayout
      locale={locale}
      title={t(
        promo ? "Your Premium access has been updated" : "Welcome to Premium",
      )}
      preview={t(
        promo
          ? "Your Premium dates and tools. Promo access does not renew automatically."
          : "Your Premium dates, tools, and subscription settings.",
      )}
    >
      <EmailParagraph>
        {t("Hi {name}, thank you for choosing Wishlist Premium.", {
          name: toName,
        })}
      </EmailParagraph>
      <EmailNote tone="muted">
        <strong>
          {t(
            promo
              ? "Premium from a promo code"
              : source === "year"
                ? "Annual subscription"
                : "Monthly subscription",
          )}
        </strong>
        <br />
        {!promo && (
          <>
            {t("Payment confirmed.")}
            <br />
          </>
        )}
        {t(
          promo
            ? "Added access: {start} – {end} (Finland time)."
            : "Paid period: {start} – {end} (Finland time).",
          { start: date(startsAt), end: date(expiresAt) },
        )}
      </EmailNote>
      <EmailHeading>{t("Your Premium tools")}</EmailHeading>
      <EmailList
        items={[
          <>
            <strong>{t("Themes and QR cards.")}</strong>{" "}
            {t(
              "Choose a theme in List settings. On a published list, use Sharing card to download a printable QR card.",
            )}
          </>,
          <>
            <strong>{t("Private lists.")}</strong>{" "}
            {t(
              "Choose Limit access in List settings → Visibility and access. Publish the list when ready.",
            )}
          </>,
          <>
            <strong>{t("Email invitations.")}</strong>{" "}
            {t(
              "Invite people in Sharing and members. They can join with a Free verified account and reserve gifts when allowed.",
            )}
          </>,
          <>
            <strong>{t("Guest links.")}</strong>{" "}
            {t(
              "Create expiring, view-only links in Manage guest links. Guests need no account and cannot reserve or edit wishes.",
            )}
          </>,
          <>
            <strong>{t("Shared management.")}</strong>{" "}
            {t(
              "Make trusted members admins to manage wishes, list settings, and sharing.",
            )}
          </>,
          <>
            <strong>{t("Profile badge.")}</strong>{" "}
            {t("Turn on your optional Premium badge in Profile settings.")}
          </>,
        ]}
      />
      <EmailNote>
        {t(
          "Only the list owner needs Premium. A QR card opens the list; it does not grant access to a private list.",
        )}
      </EmailNote>
      <EmailAction href={emailUrl(listsPath, locale)}>
        {t("Open My lists")}
      </EmailAction>
      <EmailDivider />
      <EmailHeading>{t("Manage your access")}</EmailHeading>
      <EmailList
        items={
          promo
            ? [
                t(
                  "Promo access does not renew automatically. Added days may start later if you already have Premium.",
                ),
                t(
                  "A code does not charge you, cancel a subscription, or delay its next payment.",
                ),
              ]
            : [
                t(
                  "Choose Manage subscription in Your plan to update payment details, view receipts, or cancel renewal in Paddle.",
                ),
                t(
                  "Subscriptions renew automatically. Canceling renewal keeps non-refunded access until the paid period ends.",
                ),
                t(
                  "Refunds go through Paddle. A full approved refund removes that payment’s access, but does not cancel renewal.",
                ),
              ]
        }
      />
      <EmailParagraph>
        {t(
          "When Premium ends, existing lists, access, and themes stay. New Premium tools need active access; your profile badge is hidden.",
        )}
      </EmailParagraph>
      <EmailParagraph>
        <EmailLink href={emailUrl(accountPlanPath, locale)}>
          {t("Your plan and promo codes")}
        </EmailLink>
        {" · "}
        <EmailLink href={emailUrl("/premium", locale)}>
          {t("Read the Premium guide")}
        </EmailLink>
      </EmailParagraph>
    </EmailLayout>
  );
}
PremiumEmail.PreviewProps = {
  toName: "Alex",
  locale: "en",
  source: "month",
  startsAt: "2026-11-02T12:00:00Z",
  expiresAt: "2026-12-02T12:00:00Z",
} satisfies PremiumEmailProps;
