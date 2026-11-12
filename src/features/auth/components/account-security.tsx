import styles from "@/components/shell.module.css";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { accountDeletePath, accountPasswordPath } from "@/paths";
import { readAccountSecurity } from "../service/google";
import { GoogleFeedback, GoogleOption } from "./google-option";

export async function AccountSecurity({
  userId,
  google,
}: {
  userId: string;
  google?: string;
}) {
  const [t, security] = await Promise.all([
    getText(),
    readAccountSecurity(userId),
  ]);
  return (
    <div>
      <GoogleFeedback status={google} />
      {security.googleConnected ? (
        <p>{t("Google is connected to your account.")}</p>
      ) : (
        <GoogleOption intent="connect" />
      )}
      <div className={styles.actions}>
        <Link href={accountPasswordPath}>
          {security.hasPassword ? t("Change password") : t("Set a password")}
        </Link>
        <Link href={accountDeletePath}>{t("Delete account")}</Link>
      </div>
    </div>
  );
}
