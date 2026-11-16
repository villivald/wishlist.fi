import { Text } from "react-email";
import { createText } from "@/i18n/text";
import { emailVerificationPath } from "@/paths";
import {
  EmailAction,
  EmailLayout,
  EmailLink,
  EmailNote,
  EmailParagraph,
  emailUrl,
} from "../components/layout";

type EmailVerificationProps = {
  toName: string;
  code: string;
  locale?: string;
};

const EmailVerification = ({
  toName,
  code,
  locale = "en",
}: EmailVerificationProps) => {
  const t = createText(locale);
  const url = emailUrl(emailVerificationPath, locale);
  return (
    <EmailLayout
      locale={locale}
      title={t("Verify your email")}
      preview={t(
        "Enter this code in Wishlist to finish creating your account.",
      )}
    >
      <EmailParagraph>
        {t("Hi {name}, enter this code in Wishlist to verify your email:", {
          name: toName,
        })}
      </EmailParagraph>
      <Text
        style={{
          fontFamily: "'Courier New', monospace",
          fontSize: "28px",
          lineHeight: "1.5",
          fontWeight: 700,
          letterSpacing: "2px",
          overflowWrap: "anywhere",
          wordBreak: "break-all",
          textAlign: "center",
          padding: "18px 8px",
          backgroundColor: "#eeebe1",
          color: "#292731",
          borderRadius: "4px",
          margin: "20px 0",
        }}
      >
        {code}
      </Text>
      <EmailNote>
        {t("This code expires in 30 minutes. Use only your latest code.")}
      </EmailNote>
      <EmailAction href={url}>{t("Verify email")}</EmailAction>
      <EmailParagraph>
        {t("If the button does not work, open this link:")}
        <br />
        <EmailLink href={url}>{url}</EmailLink>
      </EmailParagraph>
      <EmailParagraph>
        {t(
          "If you did not create a Wishlist account, you can ignore this email.",
        )}
      </EmailParagraph>
    </EmailLayout>
  );
};

EmailVerification.PreviewProps = {
  toName: "John Doe",
  code: "CMAGLPOI",
  locale: "en",
} satisfies EmailVerificationProps;

export default EmailVerification;
