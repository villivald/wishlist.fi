import { Compass, Gift, Heart, List, Sparkles, UserRound } from "lucide-react";
import { headers } from "next/headers";
import { Brand } from "@/components/brand/brand";
import { UserAvatar } from "@/components/cards/card-media";
import styles from "@/components/shell.module.css";
import ThemeSwitcher from "@/components/theme/theme-switcher";
import { getAuth } from "@/features/auth/actions/get-auth";
import { signOut } from "@/features/auth/actions/sign-out";
import { readAvatar } from "@/features/media/service/media";
import { readPremiumAccess } from "@/features/premium/service/entitlements";
import { localizedPath } from "@/i18n/config";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import {
  accountProfilePath,
  browsePath,
  emailVerificationPath,
  favoritesPath,
  homePath,
  listsPath,
  reservationsPath,
  signInPath,
  signUpPath,
} from "@/paths";
import { MainNavigation, type NavigationItem } from "./main-navigation";

export default async function Header() {
  const t = await getText();

  if ((await headers()).get("x-wishlist-view") === "guest") {
    return (
      <header className={styles.header}>
        <div className={styles["header-inner"]}>
          <div className={styles["guest-brand"]}>
            <Brand />
            <span className={styles["guest-view-label"]}>
              {t("Guest view")}
            </span>
          </div>
          <nav
            aria-label={t("Guest navigation")}
            className={`${styles.navigation} ${styles["guest-navigation"]}`}
          >
            <form action={localizedPath("/", t.locale)} method="get">
              <button type="submit" className={styles["text-button"]}>
                {t("Open Wishlist")}
              </button>
            </form>
            <LanguageSwitcher />
            <ThemeSwitcher />
          </nav>
        </div>
      </header>
    );
  }
  const { user } = await getAuth();
  const [avatar, access] = user?.emailVerified
    ? await Promise.all([readAvatar(user.id), readPremiumAccess(user.id)])
    : [null, null];

  const items: NavigationItem[] = [
    {
      href: browsePath,
      label: t("Browse"),
      icon: <Compass size={18} aria-hidden="true" />,
      shortcutLabel: t("Browse"),
    },
    ...(user
      ? [
          {
            href: user.emailVerified ? listsPath : emailVerificationPath,
            label: user.emailVerified ? t("My lists") : t("Verify email"),
            icon: <List size={18} aria-hidden="true" />,
            shortcutLabel: t("Lists"),
          },
          ...(user.emailVerified
            ? [
                {
                  href: reservationsPath,
                  label: t("My reservations"),
                  icon: <Gift size={18} aria-hidden="true" />,
                  shortcutLabel: t("Reservations"),
                },
                {
                  href: favoritesPath,
                  label: t("Favorites"),
                  icon: <Heart size={18} aria-hidden="true" />,
                  shortcutLabel: t("Favorites"),
                },
                {
                  href: accountProfilePath,
                  match: "/account",
                  label: t("Account"),
                  icon: <UserRound size={18} aria-hidden="true" />,
                },
              ]
            : []),
        ]
      : [
          { href: signInPath, label: t("Sign in") },
          { href: signUpPath, label: t("Create account") },
        ]),
  ];

  return (
    <header className={styles.header}>
      <div className={styles["header-inner"]}>
        <Link href={homePath} className={styles.brand}>
          <Brand />
        </Link>
        <MainNavigation collapsible={!!user?.emailVerified} items={items} />
        {user && access?.plan !== "PREMIUM" && (
          <Link href="/premium" className={styles["premium-link"]}>
            <Sparkles size={16} aria-hidden="true" />
            Premium
          </Link>
        )}
        <div className={styles["header-tools"]}>
          {user && (
            <div className={styles["header-session"]}>
              <Link
                href={
                  user.emailVerified
                    ? accountProfilePath
                    : emailVerificationPath
                }
                className={styles["account-avatar"]}
                aria-label={t("Your account: {value0}", {
                  value0: user.username,
                })}
                title={user.username}
              >
                <span aria-hidden="true">
                  <UserAvatar image={avatar} compact />
                </span>
              </Link>
              <form action={signOut}>
                <button type="submit" className={styles["text-button"]}>
                  {t("Sign out")}
                </button>
              </form>
            </div>
          )}
          <div className={styles["header-preferences"]}>
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
