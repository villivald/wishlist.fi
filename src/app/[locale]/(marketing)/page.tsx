import Image from "next/image";
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
        <div className={styles["hero-art"]} aria-hidden="true">
          <Image
            src="/illustrations/archive/hortus-malabaricus.jpg"
            width={480}
            height={395}
            sizes="(max-width: 760px) 320px, 400px"
            alt=""
            preload
          />
        </div>
      </section>
      <HomeSections />
    </div>
  );
}
