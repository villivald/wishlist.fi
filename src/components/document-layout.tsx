import "@/app/globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import Footer from "@/app/_navigation/footer";
import Header from "@/app/_navigation/header";
import { NavigationProvider } from "@/app/_navigation/navigation-context";
import { FeedbackProvider } from "@/components/form/feedback-provider";
import styles from "@/components/shell.module.css";
import ThemeProvider from "@/components/theme/theme-provider";
import { PerformanceVitals } from "@/features/performance/components/performance-vitals";
import { performanceSampleRate } from "@/features/performance/config";
import {
  PrivacyNotice,
  PrivacyPreferences,
} from "@/features/privacy/components/privacy-preferences";
import {
  PRIVACY_COOKIE,
  readPrivacyPreferences,
} from "@/features/privacy/preferences";
import { isLocale } from "@/i18n/config";
import { getText } from "@/i18n/server";
import { clientCatalog } from "@/i18n/text";

const manrope = localFont({
  src: "../assets/fonts/Manrope-Variable.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

const fraunces = localFont({
  src: "../assets/fonts/Fraunces-500-Optical.woff2",
  variable: "--font-fraunces",
  weight: "500",
  style: "normal",
  display: "swap",
  fallback: ["Georgia"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: { default: "Wishlist", template: "%s · Wishlist" },
    description: t("A place for the things you wish for."),
    // Native action posts need their origin; private URL paths stay out of referrers.
    referrer: "strict-origin",
  };
}

export default async function DocumentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getText();
  const privacy = readPrivacyPreferences(
    (await cookies()).get(PRIVACY_COOKIE)?.value,
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${fraunces.variable} ${styles.body}`}
      >
        <NextIntlClientProvider
          locale={locale}
          messages={clientCatalog(locale)}
        >
          {process.env.PERFORMANCE_MONITORING === "1" && (
            <PerformanceVitals
              sampleRate={performanceSampleRate(
                process.env.PERFORMANCE_SAMPLE_RATE,
              )}
            />
          )}
          <PrivacyPreferences
            enabled={process.env.VERCEL_ENV === "production"}
            preferences={privacy}
          >
            <ThemeProvider>
              <NavigationProvider>
                <FeedbackProvider>
                  <a href="#main-content" className={styles["skip-link"]}>
                    {t("Skip to content")}
                  </a>
                  <Header />
                  <PrivacyNotice />
                  <main id="main-content" tabIndex={-1} className={styles.main}>
                    {children}
                  </main>
                  <Footer />
                </FeedbackProvider>
              </NavigationProvider>
            </ThemeProvider>
          </PrivacyPreferences>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
