import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import { authReturnPath, safeReturnTo } from "@/features/auth/utils/return-to";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { signInPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Create account"),
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const t = await getText();

  const returnTo = safeReturnTo((await searchParams).returnTo);
  return (
    <AccountPanel
      title={t("Create your account")}
      description={t(
        "Choose a username and enter your email and a secure password.",
      )}
      footer={
        <Link href={authReturnPath(signInPath, returnTo)}>
          {t("Already have an account? Sign in")}
        </Link>
      }
    >
      <AccountForm mode="signUp" returnTo={returnTo} />
    </AccountPanel>
  );
}
