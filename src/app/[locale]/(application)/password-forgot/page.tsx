import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import { BackLink } from "@/components/back-link";
import { getText } from "@/i18n/server";
import { useText } from "@/i18n/use-text";
import { signInPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Forgot your password?"),
  };
}

export default function PasswordForgotPage() {
  const t = useText();

  return (
    <AccountPanel
      title={t("Forgot your password?")}
      description={t("Enter your email and we will send you a reset link.")}
      footer={<BackLink href={signInPath}>{t("Back to sign in")}</BackLink>}
    >
      <AccountForm mode="passwordForgot" />
    </AccountPanel>
  );
}
