import { createText } from "@/i18n/text";
import {
  EmailAction,
  EmailLayout,
  EmailLink,
  EmailList,
  EmailNote,
  EmailParagraph,
} from "../components/layout";

export default function InvitationEmail({
  url,
  locale = "en",
  listTitle,
  inviterUsername,
}: {
  url: string;
  locale?: string;
  listTitle?: string;
  inviterUsername?: string;
}) {
  const t = createText(locale);
  return (
    <EmailLayout
      locale={locale}
      title={t("Your Wishlist invitation")}
      preview={t("You have been invited to a list on Wishlist.")}
    >
      <EmailParagraph>
        {t("You have been invited to a list on Wishlist.")}
      </EmailParagraph>
      {listTitle !== undefined && (
        <EmailParagraph>
          <strong>{t("List")}:</strong> {listTitle}
          {inviterUsername !== undefined && (
            <>
              <br />
              <strong>{t("Invited by")}:</strong> @{inviterUsername}
            </>
          )}
        </EmailParagraph>
      )}
      <EmailList
        ordered
        items={[
          t(
            "Sign in with this email address and verify it. A Free account is enough.",
          ),
          t(
            "Review the invitation and choose whether to join. It expires seven days after it was created.",
          ),
        ]}
      />
      <EmailAction href={url}>{t("Review invitation")}</EmailAction>
      <EmailNote>
        {t(
          "Joining shares your username and membership role with the list admins.",
        )}
      </EmailNote>
      <EmailParagraph>
        {t("If the button does not work, open this link:")}
        <br />
        <EmailLink href={url}>{url}</EmailLink>
      </EmailParagraph>
      <EmailParagraph>
        {t("If you were not expecting this invitation, you can ignore it.")}
      </EmailParagraph>
    </EmailLayout>
  );
}

InvitationEmail.PreviewProps = {
  url: "http://localhost:3000/en/invitations/example-token",
  locale: "en",
  listTitle: "Birthday wishes",
  inviterUsername: "alex",
};
