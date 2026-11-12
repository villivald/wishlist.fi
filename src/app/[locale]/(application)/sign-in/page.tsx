import type { Metadata } from "next";
import { AccountForm } from "@/components/account-form";
import { AccountPanel } from "@/components/account-panel";
import {
  GoogleFeedback,
  GoogleOption,
} from "@/features/auth/components/google-option";
import { authReturnPath, safeReturnTo } from "@/features/auth/utils/return-to";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { passwordForgotPath, signUpPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Sign in"),
  };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    reset?: string;
    deleted?: string;
    returnTo?: string;
    google?: string;
  }>;
}) {
  const t = await getText();

  const {
    reset,
    deleted,
    google,
    returnTo: requestedReturnTo,
  } = await searchParams;
  const returnTo = safeReturnTo(requestedReturnTo);
  return (
    <AccountPanel
      title={t("Welcome back")}
      description={
        deleted === "1"
          ? t("Your account has been deleted.")
          : reset === "success"
            ? t("Your password has been reset. Sign in with your new password.")
            : t("Sign in to your Wishlist account.")
      }
      footer={
        <>
          <Link href={authReturnPath(signUpPath, returnTo)}>
            {t("Create an account")}
          </Link>
          <Link href={passwordForgotPath}>{t("Forgot password?")}</Link>
        </>
      }
    >
      <GoogleFeedback status={google} />
      <GoogleOption returnTo={returnTo} separate />
      <AccountForm mode="signIn" returnTo={returnTo} />
    </AccountPanel>
  );
}
