import Image from "next/image";
import { getLocale } from "next-intl/server";
import shell from "@/components/shell.module.css";
import { getText } from "@/i18n/server";
import { googleConfig, type GoogleIntent } from "../service/google";
import styles from "./google.module.css";

export async function GoogleOption({
  intent = "sign-in",
  returnTo,
  separate = false,
}: {
  intent?: GoogleIntent;
  returnTo?: string;
  separate?: boolean;
}) {
  if (!googleConfig()) return null;
  const [t, locale] = await Promise.all([getText(), getLocale()]);
  const query = new URLSearchParams({ locale, intent });
  if (returnTo) query.set("returnTo", returnTo);
  return (
    <div className={styles.option}>
      <form method="post" action={`/api/auth/google/start?${query}`}>
        <button type="submit" className={styles.button}>
          <Image
            src="/google-g.png"
            width={20}
            height={20}
            alt=""
            aria-hidden="true"
          />
          <span>
            {intent === "connect"
              ? t("Connect Google")
              : intent === "delete"
                ? t("Confirm with Google")
                : t("Continue with Google")}
          </span>
        </button>
      </form>
      {separate && (
        <p className={`${shell.muted} ${styles.separator}`}>
          <span>{t("or continue with email")}</span>
        </p>
      )}
    </div>
  );
}

export async function GoogleFeedback({ status }: { status?: string }) {
  const t = await getText();
  if (status === "canceled")
    return (
      <p role="status" className={shell.notice}>
        {t("Google sign-in was canceled. You can try again or use email.")}
      </p>
    );
  if (status === "link-required")
    return (
      <p role="alert" className={shell.error}>
        {t(
          "If you already have a Wishlist account, sign in with email first, then connect Google in account settings.",
        )}
      </p>
    );
  if (status === "failed")
    return (
      <p role="alert" className={shell.error}>
        {t(
          "Google sign-in could not be completed. Try again, use email, or open this page in your browser.",
        )}
      </p>
    );
  return null;
}
