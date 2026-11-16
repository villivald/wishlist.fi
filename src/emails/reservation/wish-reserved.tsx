import { createText } from "@/i18n/text";
import {
  EmailAction,
  EmailLayout,
  EmailLink,
  EmailParagraph,
} from "../components/layout";

type WishReservedEmailProps = {
  wishTitle: string;
  listTitle: string;
  url: string;
  locale?: string;
};

export default function WishReservedEmail({
  wishTitle,
  listTitle,
  url,
  locale = "en",
}: WishReservedEmailProps) {
  const t = createText(locale);
  return (
    <EmailLayout
      locale={locale}
      title={t("Your wish was reserved")}
      preview={t("A wish on your list has been reserved.")}
    >
      <EmailParagraph>
        {t("A wish on your list has been reserved.")}
      </EmailParagraph>
      <EmailParagraph>
        <strong>{t("Wish")}:</strong> {wishTitle}
        <br />
        <strong>{t("List")}:</strong> {listTitle}
      </EmailParagraph>
      <EmailParagraph>
        {t("The reserver's identity stays private.")}
      </EmailParagraph>
      <EmailAction href={url}>{t("View wish")}</EmailAction>
      <EmailParagraph>
        {t("If the button does not work, open this link:")}
        <br />
        <EmailLink href={url}>{url}</EmailLink>
      </EmailParagraph>
    </EmailLayout>
  );
}

WishReservedEmail.PreviewProps = {
  wishTitle: "A beautiful notebook",
  listTitle: "Birthday wishes",
  url: "https://wishlist.fi/en/lists/example/wishes/example-wish",
  locale: "en",
} satisfies WishReservedEmailProps;
