import { Heart, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import sharingCardEn from "@/assets/illustrations/premium-sharing-card.png";
import sharingCardFi from "@/assets/illustrations/premium-sharing-card-fi.png";
import shell from "@/components/shell.module.css";
import { getAuth } from "@/features/auth/actions/get-auth";
import { authReturnPath } from "@/features/auth/utils/return-to";
import {
  billingCheckoutEnabled,
  billingEnvironment,
  plans,
} from "@/features/billing/service/config";
import styles from "@/features/premium/components/personalization.module.css";
import { PlanBenefits } from "@/features/premium/components/plan-benefits";
import { PremiumBadge } from "@/features/premium/components/premium-badge";
import { ThemePicker } from "@/features/premium/components/theme-picker";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { accountPlanPath, emailVerificationPath, signUpPath } from "@/paths";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return { title: t("Free and Premium") };
}

export default async function PremiumPage() {
  const t = await getText();
  const [{ user }, locale] = await Promise.all([getAuth(), getLocale()]);
  const destination = user?.emailVerified
    ? accountPlanPath
    : authReturnPath(
        user ? emailVerificationPath : signUpPath,
        accountPlanPath,
      );
  const saving =
    Math.round(
      (1 - Number(plans.year.amount) / (Number(plans.month.amount) * 12)) *
        1000,
    ) / 10;
  return (
    <section className={shell.page}>
      <header className={styles["premium-hero"]}>
        <div className={styles["hero-copy"]}>
          <p className={shell.eyebrow}>Wishlist · Premium</p>
          <h1>{t("Make your wishlist your own.")}</h1>
          <p className={shell.description}>
            {t(
              "Choose an illustrated theme, download a QR sharing card, and decide who can see your lists.",
            )}
          </p>
          <p>
            {t.message(plans.year.display)} · {t.message(plans.month.display)}
          </p>
          <Link href="#compare-plans" className={shell.button}>
            {t("Compare plans")}
          </Link>
        </div>
        <div className={styles["hero-gallery"]} aria-hidden="true">
          {[
            "occasion-christmas.webp",
            "occasion-birthday.webp",
            "occasion-love.webp",
          ].map((artwork, index) => (
            <Image
              key={artwork}
              src={`/illustrations/themes/${artwork}`}
              width={1000}
              height={700}
              sizes="(max-width: 760px) 30vw, 160px"
              preload={index === 0}
              alt=""
            />
          ))}
        </div>
      </header>
      <section className={styles.demo} aria-labelledby="theme-demo-heading">
        <div className={styles["section-intro"]}>
          <h2 id="theme-demo-heading">{t("Choose a theme for your list")}</h2>
          <p>
            {t(
              "Choose Christmas, Birthday, Baby & kids, or Love for a special occasion. Botanical and Waves suit everyday lists. Preview them here and save your choice in List settings.",
            )}
          </p>
        </div>
        <ThemePicker current="birthday" premium demo name="preview-theme" />
        <p className={styles["art-credit"]}>
          {t("Botanical and Waves feature artwork from")}{" "}
          <a href="https://publicdomainreview.org/collection/japanese-designs-1902/">
            Shin-Bijutsukai (1902)
          </a>
          {t(", via The Public Domain Image Archive.")}
        </p>
      </section>
      <section className={styles["sharing-feature"]}>
        <div className={styles["card-stage"]}>
          <Image
            src={locale === "fi" ? sharingCardFi : sharingCardEn}
            width={1200}
            height={800}
            alt={t(
              "Example birthday sharing card with a list title and QR code",
            )}
            sizes="(max-width: 760px) 90vw, 520px"
            className={styles["feature-image"]}
          />
        </div>
        <div className={styles["feature-copy"]}>
          <h2>{t("Share your wishlist as a card")}</h2>
          <p>
            {t(
              "Send your wishlist with an invitation, share it in a group chat, or print it for the party. One scan takes guests to your list.",
            )}
          </p>
          <h3>{t("How to download your card")}</h3>
          <ol className={styles["download-steps"]}>
            <li>{t("Open one of your lists.")}</li>
            <li>{t("Choose Sharing card above the wishes.")}</li>
            <li>{t("Select Download sharing card to save the PNG.")}</li>
          </ol>
          <p className={styles.help}>
            {t("A QR code opens the list. Private lists still require access.")}
          </p>
        </div>
      </section>
      <section className={styles["badge-feature"]}>
        <div className={styles["feature-copy"]}>
          <h2>{t("An optional badge on your profile")}</h2>
          <p>
            {t(
              "Show a small Premium badge beside your name in People. Turn it on in Profile settings whenever you like; it stays hidden until then.",
            )}
          </p>
        </div>
        <div
          className={styles["profile-example"]}
          aria-label={t("Example profile card")}
        >
          <span className={styles["example-avatar"]} aria-hidden="true">
            A
          </span>
          <div className={styles["example-name"]}>
            <strong>Alex</strong>
            <PremiumBadge />
          </div>
          <p>{t.plural("{count} public list", "{count} public lists", 2)}</p>
        </div>
      </section>
      <section
        id="compare-plans"
        className={styles.demo}
        aria-labelledby="compare-heading"
      >
        <div className={styles["section-intro"]}>
          <h2 id="compare-heading">{t("Free and Premium")}</h2>
          <p>
            {t(
              "The essentials are free. Premium adds illustrated themes and more ways to share.",
            )}
          </p>
        </div>
        <div className={styles.comparison}>
          <section className={styles.plan} aria-labelledby="free-heading">
            <h3 id="free-heading" className={shell["icon-label"]}>
              <Heart aria-hidden="true" />
              {t("Free")}
            </h3>
            <p className={styles.price}>{t("€0")}</p>
            <p>{t("No subscription needed.")}</p>
            <ul>
              <li>
                {t("Public lists with wishes, images, and product links")}
              </li>
              <li>{t("Favorites and gift reservations")}</li>
              <li>{t("Group reservations with friends")}</li>
            </ul>
            <Link
              href={user ? "/lists" : signUpPath}
              className={shell["secondary-button"]}
            >
              {user ? t("My lists") : t("Create account")}
            </Link>
          </section>
          <section
            className={`${styles.plan} ${styles["premium-plan"]}`}
            aria-labelledby="premium-heading"
          >
            <h3 id="premium-heading" className={shell["icon-label"]}>
              <Sparkles aria-hidden="true" />
              Premium
            </h3>
            <p className={styles.price}>{t.message(plans.year.display)}</p>
            <p>
              {t("Or {price}.", { price: t.message(plans.month.display) })}{" "}
              {t("Save {saving}% with annual billing.", { saving })}
            </p>
            <p>{t("Everything in Free, plus:")}</p>
            <PlanBenefits />
            <Link href={destination} className={shell.button}>
              {user?.emailVerified
                ? t("Your plan and promo codes")
                : user
                  ? t("Verify email")
                  : t("Create account")}
            </Link>
          </section>
        </div>
        <div className={styles["plan-notes"]}>
          <p>
            {t(
              "Choose monthly or annual billing. Both include the same features.",
            )}{" "}
            {t(
              "Includes applicable tax. Premium starts after payment confirmation.",
            )}
          </p>
          <p>
            {t(
              "Renews automatically until canceled. Cancel renewal in Paddle; paid access continues until its end date.",
            )}
          </p>
          {(!billingCheckoutEnabled(user?.id) ||
            billingEnvironment() === "sandbox") && (
            <p className={shell.notice}>
              {billingCheckoutEnabled(user?.id)
                ? t(
                    "Sandbox · Use Paddle test payment details only. No real money is charged.",
                  )
                : t(
                    "Subscriptions are not available yet. You can still use a promo code.",
                  )}
            </p>
          )}
        </div>
        <details className={shell.disclosure}>
          <summary>{t("Does everyone need Premium?")}</summary>
          <p>
            {t(
              "Only the list owner needs Premium. People you invite can view or reserve wishes with a Free account.",
            )}
          </p>
          <p>
            {t(
              "Guest links provide read-only access without an account. Reserving requires a verified account.",
            )}
          </p>
        </details>
        <details className={shell.disclosure}>
          <summary>{t("What happens when Premium ends?")}</summary>
          <p>
            {t(
              "Your lists and existing access stay in place. New private sharing, invitations, guest links, and admin assignments require Premium. You can still remove access.",
            )}
          </p>
          <p>
            {t(
              "Selected themes stay when Premium ends. New Premium themes and card downloads require active Premium; the badge is hidden until Premium is active again.",
            )}
          </p>
        </details>
        <details className={shell.disclosure}>
          <summary>{t("Have a promo code?")}</summary>
          <p>
            {t(
              "Promo codes grant Premium for a limited time without starting a subscription.",
            )}{" "}
            <Link href={destination}>{t("Your plan and promo codes")}</Link>
          </p>
        </details>
      </section>
    </section>
  );
}
