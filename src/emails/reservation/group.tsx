import { createText } from "@/i18n/text";
import {
  EmailAction,
  EmailLayout,
  EmailLink,
  EmailNote,
  EmailParagraph,
} from "../components/layout";

type GroupEmailProps = {
  kind: "INVITED" | "ACCEPTED";
  actorName: string;
  url: string;
  locale?: string;
};

export default function GroupEmail({
  kind,
  actorName,
  url,
  locale = "en",
}: GroupEmailProps) {
  const t = createText(locale);
  const invited = kind === "INVITED";
  const title = t(invited ? "Group invitation" : "Invitation accepted");
  const preview = t(
    invited
      ? "You're invited to a group reservation"
      : "Someone joined your group reservation",
  );
  return (
    <EmailLayout locale={locale} title={title} preview={preview}>
      <EmailParagraph>
        {t(
          invited
            ? "{name} invited you to reserve a gift together on Wishlist."
            : "{name} accepted your group reservation invitation.",
          { name: actorName },
        )}
      </EmailParagraph>
      <EmailParagraph>
        {t(
          invited
            ? "Sign in to the account this email belongs to, then review the invitation."
            : "Open the group to see its current members and coordinate the gift. No payment is collected.",
        )}
      </EmailParagraph>
      {invited && (
        <EmailParagraph>
          {t(
            "The invitation expires seven days after it was created. It does not grant access to a private list.",
          )}
        </EmailParagraph>
      )}
      <EmailAction href={url}>
        {t(invited ? "Review invitation" : "Manage group reservation")}
      </EmailAction>
      {invited && (
        <EmailNote>
          {t(
            "Joining shares your name and username with the group. Wishlist does not collect payments for group gifts.",
          )}
        </EmailNote>
      )}
      <EmailParagraph>
        {t("If the button does not work, open this link:")}
        <br />
        <EmailLink href={url}>{url}</EmailLink>
      </EmailParagraph>
      {invited && (
        <EmailParagraph>
          {t("If you were not expecting this invitation, you can ignore it.")}
        </EmailParagraph>
      )}
    </EmailLayout>
  );
}

GroupEmail.PreviewProps = {
  kind: "INVITED",
  actorName: "Alex (@alex)",
  url: "http://localhost:3000/en/reservations/example",
  locale: "en",
} satisfies GroupEmailProps;
