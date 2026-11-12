import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import { BackLink } from "@/components/back-link";
import { PasswordSetup } from "@/features/auth/components/password-setup";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { readAccountSecurity } from "@/features/auth/service/google";
import { getText } from "@/i18n/server";
import { accountProfilePath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Change password"),
    robots: { index: false, follow: false },
  };
}

export default async function PasswordPage() {
  const t = await getText();
  const { user } = await getAuthOrRedirect();
  const { hasPassword } = await readAccountSecurity(user.id);

  return (
    <AccountPanel
      title={hasPassword ? t("Change password") : t("Set a password")}
      description={
        hasPassword
          ? t(
              "Your current password is required. Changing it signs out your other sessions.",
            )
          : t("Add email and password as another way to sign in.")
      }
      footer={
        <BackLink href={accountProfilePath}>{t("Back to account")}</BackLink>
      }
    >
      {hasPassword ? <AccountForm mode="passwordChange" /> : <PasswordSetup />}
    </AccountPanel>
  );
}
