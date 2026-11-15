import { useText } from "@/i18n/use-text";

export function PlanBenefits() {
  const t = useText();
  return (
    <ul>
      <li>{t("Eight illustrated list themes")}</li>
      <li>{t("Downloadable PNG cards with a QR code")}</li>
      <li>{t("Private lists, invitations, and guest links")}</li>
      <li>{t("Shared list management and an optional profile badge")}</li>
    </ul>
  );
}
