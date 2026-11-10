import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import { BackLink } from "@/components/back-link";
import { getText } from "@/i18n/server";
import { useText } from "@/i18n/use-text";
import { accountProfilePath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Change password"),
    robots: { index: false, follow: false },
  };
}

export default function PasswordPage() {
  const t = useText();

  return (
    <AccountPanel
      title={t("Change password")}
      description={t(
        "Your current password is required. Changing it signs out your other sessions.",
      )}
      footer={
        <BackLink href={accountProfilePath}>{t("Back to account")}</BackLink>
      }
    >
      <AccountForm mode="passwordChange" />
    </AccountPanel>
  );
}
