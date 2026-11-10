import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { safeReturnTo } from "@/features/auth/utils/return-to";
import { getText } from "@/i18n/server";
import { redirect } from "@/i18n/server-navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Verify your email"),
    robots: { index: false, follow: false },
  };
}

export default async function EmailVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const t = await getText();

  const returnTo = safeReturnTo((await searchParams).returnTo);
  const { user } = await getAuthOrRedirect({
    checkEmailVerified: false,
    returnTo,
  });

  if (user.emailVerified) {
    return await redirect(returnTo);
  }

  return (
    <AccountPanel
      title={t("Verify your email")}
      description={t(
        "Check {value0} for a code. Codes expire after 30 minutes. If no email arrived, send a new code below.",
        { value0: user.email },
      )}
    >
      <AccountForm mode="emailVerification" returnTo={returnTo} />
      <AccountForm mode="emailVerificationResend" />
    </AccountPanel>
  );
}
