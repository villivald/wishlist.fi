import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { randomInt } from "node:crypto";
import { HomeHeroArt } from "@/components/home/home-hero-art";
import { homeHeroArtworks } from "@/components/home/home-hero-artworks";
import { HomeSections } from "@/components/home/home-sections";
import styles from "@/components/shell.module.css";
import { getAuth } from "@/features/auth/actions/get-auth";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { getCanonicalUrl } from "@/lib/search-indexing";
import {
  browsePath,
  emailVerificationPath,
  listsPath,
  newListPath,
  signUpPath,
} from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getText(), getLocale()]);
  return {
    title: t("Create and share your wishlist"),
    description: t(
      "Collect the things you love, share a list with your people, and make finding the right gift a little easier.",
    ),
    alternates: { canonical: getCanonicalUrl("/", locale) },
  };
}

export default async function HomePage() {
  const t = await getText();

  const { user } = await getAuth();

  const artwork = homeHeroArtworks[randomInt(homeHeroArtworks.length)];
  const createAction = user
    ? user.emailVerified
      ? { href: newListPath, label: "Create a list" as const }
      : { href: emailVerificationPath, label: "Verify email" as const }
    : { href: signUpPath, label: "Start your own list" as const };

  return (
    <div className={styles["home-page"]}>
      <section className={styles.hero}>
        <div className={styles["hero-copy"]}>
          <p className={styles.eyebrow}>{t("Good things, remembered")}</p>
          <h1>
            {t("A little space for")} <em>{t("your wishes.")}</em>
          </h1>
          <p className={styles.muted}>
            {t(
              "Collect the things you love, share a list with your people, and make finding the right gift a little easier.",
            )}
          </p>
          <div className={styles.actions}>
            <Link
              href={user?.emailVerified ? listsPath : createAction.href}
              className={styles.button}
            >
              {t(
                user
                  ? user.emailVerified
                    ? "My lists"
                    : "Verify email"
                  : "Create your account",
              )}
            </Link>
            <Link
              href={user?.emailVerified ? newListPath : browsePath}
              className={styles["secondary-button"]}
            >
              {t(
                user?.emailVerified
                  ? "Create a list"
                  : "Browse public wishlists",
              )}
            </Link>
          </div>
          <p className={styles.muted}>
            {t("Free to start. Yours to make personal.")}
          </p>
        </div>
        <HomeHeroArt artwork={artwork} />
      </section>
      <HomeSections
        createHref={createAction.href}
        createLabel={createAction.label}
      />
    </div>
  );
}
