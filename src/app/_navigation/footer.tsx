import {
  ArrowUpRight,
  Camera,
  Coffee,
  type LucideIcon,
  Mail,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { headers } from "next/headers";
import { Brand } from "@/components/brand/brand";
import { getAuth } from "@/features/auth/actions/get-auth";
import { getHomePath } from "@/features/auth/utils/home-path";
import { CookieSettings } from "@/features/privacy/components/privacy-preferences";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { communityLinks } from "@/lib/community-links";
import styles from "./footer.module.css";

const communityItems: {
  name: "Instagram" | "Facebook" | "Buy Me a Coffee";
  icon: LucideIcon;
  href: string;
}[] = [
  { name: "Instagram", icon: Camera, href: communityLinks.instagram },
  { name: "Facebook", icon: MessageCircle, href: communityLinks.facebook },
  { name: "Buy Me a Coffee", icon: Coffee, href: communityLinks.buyMeACoffee },
];

export default async function Footer() {
  const t = await getText();

  if ((await headers()).get("x-wishlist-view") === "guest") {
    return (
      <footer className={styles["guest-footer"]}>
        <Brand />
        <span>{t("Shared with care")}</span>
      </footer>
    );
  }

  const { user } = await getAuth();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.intro}>
          <Link href={getHomePath(user)} className={styles.brand}>
            <Brand variant="footer" />
          </Link>
          <p>{t("Good things are even better shared.")}</p>
          <div className={styles["contact-details"]}>
            <a className={styles.contact} href="mailto:support@wishlist.fi">
              <Mail size={18} aria-hidden="true" />
              {t("Get in touch")}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <p className={styles.description}>
              {t("Questions, feedback, ideas, and collaboration.")}
            </p>
          </div>
        </div>
        <nav aria-label={t("Footer explore")} className={styles.links}>
          <h2>{t("Explore")}</h2>
          <Link href="/browse">{t("Explore wishlists")}</Link>
          <Link href="/browse?view=users">{t("Find people")}</Link>
          <Link href="/lists">{t("Your wishlists")}</Link>
          {user?.emailVerified && (
            <Link href="/favorites">{t("Favorites")}</Link>
          )}
          <Link href="/site-map">{t("Site map")}</Link>
        </nav>
        <nav aria-label={t("Footer information")} className={styles.links}>
          <h2>{t("Help and information")}</h2>
          <Link href="/premium">{t("Free and Premium")}</Link>
          <Link href="/about">{t("About and credits")}</Link>
          <Link href="/accessibility">{t("Accessibility")}</Link>
          <Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/terms">{t("Terms")}</Link>
          <Link href="/refunds">{t("Refunds and cancellations")}</Link>
        </nav>
        <div className={styles.community}>
          <section className={styles.links} aria-labelledby="footer-community">
            <h2 id="footer-community">{t("Follow and support")}</h2>
            <ul className={styles["community-links"]}>
              {communityItems.map(({ name, icon: Icon, href }) => (
                <li key={name}>
                  <a
                    className={styles["community-link"]}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span translate="no">{name}</span>
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section className={styles.mobile} aria-labelledby="footer-mobile">
            <h2 id="footer-mobile">
              <Smartphone size={18} aria-hidden="true" />
              {t("Mobile app")}
            </h2>
            <span className={styles.status}>{t("In the works")}</span>
            <p className={styles.description}>
              {t("Until then, use Wishlist in your phone’s browser.")}
            </p>
          </section>
        </div>
        <div className={styles.bottom}>
          <CookieSettings />
          <p>
            {t("Designed and built by")}{" "}
            <a href="https://www.villivald.com/">villivald</a> · ©{" "}
            {new Date().getUTCFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
