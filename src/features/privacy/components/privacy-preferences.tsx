"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import GoogleTagManager from "@/components/google-tag-manager";
import shell from "@/components/shell.module.css";
import { Link } from "@/i18n/navigation";
import { useText } from "@/i18n/use-text";
import {
  googleConsent,
  PRIVACY_CHANGE_EVENT,
  PRIVACY_COOKIE,
  type PrivacyPreferences as Preferences,
  readPrivacyPreferences,
  serializePrivacyPreferences,
} from "../preferences";
import { sanitizeTrackingEvent } from "../routes";
import styles from "./privacy.module.css";

const PrivacyContext = createContext<{
  enabled: boolean;
  showNotice: boolean;
  open: (trigger: HTMLButtonElement) => void;
  save: (preferences: Preferences) => void;
} | null>(null);

const subscribe = () => () => {};
const browserBlocksTracking = () =>
  navigator.doNotTrack === "1" ||
  (navigator as Navigator & { globalPrivacyControl?: boolean })
    .globalPrivacyControl === true;

const clearTrackingCookies = (preferences: Preferences) => {
  const names = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0]);
  const domains = location.hostname
    .split(".")
    .slice(0, -1)
    .map((_part, index) => location.hostname.split(".").slice(index).join("."));
  for (const name of names) {
    if (
      ((!preferences.marketing || !preferences.analytics) &&
        /^_ga(?:_|$)/.test(name)) ||
      (!preferences.marketing && /^_gcl_/.test(name))
    ) {
      document.cookie = `${name}=; Max-Age=0; Path=/`;
      for (const domain of domains)
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}`;
    }
  }
};

export function PrivacyPreferences({
  children,
  enabled,
  preferences,
}: {
  children: React.ReactNode;
  enabled: boolean;
  preferences: Preferences | null;
}) {
  const t = useText();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const [analytics, setAnalytics] = useState(preferences?.analytics ?? false);
  const [advertising, setAdvertising] = useState(
    preferences?.marketing ?? false,
  );
  // Until hydration can inspect privacy signals, no third-party scripts mount.
  const trackingAllowed = useSyncExternalStore(
    subscribe,
    () => !browserBlocksTracking(),
    () => false,
  );
  const open = useCallback((trigger: HTMLButtonElement) => {
    opener.current = trigger;
    dialog.current?.showModal();
    heading.current?.focus({ preventScroll: true });
    if (dialog.current) dialog.current.scrollTop = 0;
  }, []);
  const save = useCallback((next: Preferences) => {
    document.cookie = `${PRIVACY_COOKIE}=${serializePrivacyPreferences(next)}; Path=/; Max-Age=15552000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    const gtag = (window as Window & { gtag?: (...args: unknown[]) => void })
      .gtag;
    gtag?.("consent", "update", googleConsent(next));
    clearTrackingCookies(next);
    try {
      localStorage.setItem(PRIVACY_CHANGE_EVENT, String(Date.now()));
    } catch {
      // The preference cookie works even when browser storage is unavailable.
    }
    // A new document unloads scripts and listeners after withdrawing consent.
    location.reload();
  }, []);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === PRIVACY_CHANGE_EVENT) location.reload();
    };
    const restored = () => {
      const stored = document.cookie
        .split(";")
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(`${PRIVACY_COOKIE}=`))
        ?.slice(PRIVACY_COOKIE.length + 1);
      const current = readPrivacyPreferences(stored);
      if (JSON.stringify(current) !== JSON.stringify(preferences))
        location.reload();
    };
    window.addEventListener("storage", changed);
    window.addEventListener("pageshow", restored);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("pageshow", restored);
    };
  }, [preferences]);

  return (
    <PrivacyContext
      value={{ enabled, showNotice: enabled && !preferences, open, save }}
    >
      {children}
      {enabled && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby={headingId}
          aria-describedby={`${headingId}-description`}
          onClose={() => {
            setAnalytics(preferences?.analytics ?? false);
            setAdvertising(preferences?.marketing ?? false);
            opener.current?.focus({ preventScroll: true });
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save({ analytics, marketing: advertising });
            }}
          >
            <h2 ref={heading} tabIndex={-1} id={headingId}>
              {t("Cookie settings")}
            </h2>
            <p id={`${headingId}-description`}>
              {t(
                "Choose optional services. Essential cookies are always used.",
              )}
            </p>
            <label className={styles.option}>
              <input
                type="checkbox"
                name="analytics"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
              />
              <strong>{t("Analytics")}</strong>
              <span>{t("Vercel site usage and performance.")}</span>
            </label>
            <label className={styles.option}>
              <input
                type="checkbox"
                name="advertising"
                checked={advertising}
                onChange={(event) => setAdvertising(event.target.checked)}
              />
              <strong>{t("Advertising")}</strong>
              <span>{t("Google ad measurement and advertising cookies.")}</span>
            </label>
            {trackingAllowed === false && (
              <p>
                {t("Your browser’s privacy signal blocks optional tracking.")}
              </p>
            )}
            <p>
              <Link href="/privacy">{t("Privacy")}</Link>
            </p>
            <div className={styles.actions}>
              <button type="submit" className={shell.button}>
                {t("Save cookie choices")}
              </button>
              <button
                type="button"
                className={shell["secondary-button"]}
                onClick={() => dialog.current?.close()}
              >
                {t("Cancel")}
              </button>
            </div>
          </form>
        </dialog>
      )}
      {enabled && trackingAllowed && preferences?.marketing && (
        <GoogleTagManager analytics={preferences.analytics} />
      )}
      {enabled && trackingAllowed && preferences?.analytics && (
        <>
          <Analytics beforeSend={sanitizeTrackingEvent} />
          <SpeedInsights beforeSend={sanitizeTrackingEvent} />
        </>
      )}
    </PrivacyContext>
  );
}

export function CookieSettings() {
  const privacy = useContext(PrivacyContext);
  const t = useText();
  return privacy?.enabled ? (
    <button
      type="button"
      className={shell["text-button"]}
      onClick={(event) => privacy.open(event.currentTarget)}
    >
      {t("Cookie settings")}
    </button>
  ) : null;
}

export function PrivacyNotice() {
  const privacy = useContext(PrivacyContext);
  const t = useText();
  const headingId = useId();
  if (!privacy?.showNotice) return null;
  return (
    <section className={styles.notice} aria-labelledby={headingId}>
      <div>
        <h2 id={headingId}>{t("Your privacy choices")}</h2>
        <p>
          {t(
            "May we use optional analytics and Google advertising cookies throughout our site? You can change your choice in Cookie settings.",
          )}{" "}
          <Link href="/privacy">{t("Privacy")}</Link>
        </p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={shell["secondary-button"]}
          onClick={() => privacy.save({ analytics: false, marketing: false })}
        >
          {t("Essential only")}
        </button>
        <button
          type="button"
          className={shell["secondary-button"]}
          onClick={() => privacy.save({ analytics: true, marketing: true })}
        >
          {t("Allow all")}
        </button>
        <button
          type="button"
          className={shell["text-button"]}
          onClick={(event) => privacy.open(event.currentTarget)}
        >
          {t("Cookie settings")}
        </button>
      </div>
    </section>
  );
}
