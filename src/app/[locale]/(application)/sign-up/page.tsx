import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import {
  GoogleFeedback,
  GoogleOption,
} from "@/features/auth/components/google-option";
import { googleConfig } from "@/features/auth/service/google";
import { authReturnPath, safeReturnTo } from "@/features/auth/utils/return-to";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { getCanonicalUrl } from "@/lib/search-indexing";
import { signInPath, signUpPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getText(), getLocale()]);
  return {
    title: t("Create account"),
    alternates: { canonical: getCanonicalUrl(signUpPath, locale) },
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; google?: string }>;
}) {
  const t = await getText();

  const { returnTo: requestedReturnTo, google } = await searchParams;
  const returnTo = safeReturnTo(requestedReturnTo);
  return (
    <AccountPanel
      title={t("Create your account")}
      description={
        googleConfig()
          ? t("Create your account with Google or email.")
          : t("Choose a username and enter your email and a secure password.")
      }
      footer={
        <Link href={authReturnPath(signInPath, returnTo)}>
          {t("Already have an account? Sign in")}
        </Link>
      }
    >
      <GoogleFeedback status={google} />
      <GoogleOption returnTo={returnTo} separate />
      <AccountForm mode="signUp" returnTo={returnTo} />
    </AccountPanel>
  );
}
