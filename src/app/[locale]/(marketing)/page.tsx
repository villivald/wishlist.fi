import { randomInt } from "node:crypto";
import { HomeHeroArt } from "@/components/home/home-hero-art";
import { homeHeroArtworks } from "@/components/home/home-hero-artworks";
import { HomeSections } from "@/components/home/home-sections";
import styles from "@/components/shell.module.css";
import { getAuth } from "@/features/auth/actions/get-auth";
import { getHomePath } from "@/features/auth/utils/home-path";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { redirect } from "@/i18n/server-navigation";
import { browsePath, signUpPath } from "@/paths";

export default async function HomePage() {
  const t = await getText();

  const { user } = await getAuth();

  if (user) {
    return await redirect(getHomePath(user));
  }

  const artwork = homeHeroArtworks[randomInt(homeHeroArtworks.length)];

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
            <Link href={signUpPath} className={styles.button}>
              {t("Create your account")}
            </Link>
            <Link href={browsePath} className={styles["secondary-button"]}>
              {t("Browse public wishlists")}
            </Link>
          </div>
          <p className={styles.muted}>
            {t("Free to start. Yours to make personal.")}
          </p>
        </div>
        <HomeHeroArt artwork={artwork} />
      </section>
      <HomeSections />
    </div>
  );
}
