import { createText } from "@/i18n/text";
import { EmailAction, EmailLayout, EmailParagraph } from "../components/layout";

export default function InvitationAcceptedEmail({
  username,
  url,
  locale = "en",
  listTitle,
}: {
  username: string;
  url: string;
  locale?: string;
  listTitle: string;
}) {
  const t = createText(locale);
  return (
    <EmailLayout
      locale={locale}
      title={t("Invitation accepted")}
      preview={t("Someone accepted your list invitation.")}
    >
      <EmailParagraph>
        {t("{username} accepted your list invitation.", {
          username: `@${username}`,
        })}
      </EmailParagraph>
      <EmailParagraph>
        <strong>{t("List")}:</strong> {listTitle}
      </EmailParagraph>
      <EmailParagraph>
        {t(
          "Open the sharing settings to view members and manage their access.",
        )}
      </EmailParagraph>
      <EmailAction href={url}>{t("Manage list members")}</EmailAction>
    </EmailLayout>
  );
}

InvitationAcceptedEmail.PreviewProps = {
  username: "alex",
  url: "https://wishlist.fi/en/lists/example/sharing",
  locale: "en",
  listTitle: "Birthday wishes",
};
