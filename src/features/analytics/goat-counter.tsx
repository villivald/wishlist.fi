"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import { goatCounterOrigin } from "./config";
import { goatCounterRoute } from "./routes";

export function GoatCounter({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (
      !pathname ||
      window.top !== window ||
      navigator.webdriver ||
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    )
      return;

    const count = () => {
      if (
        document.visibilityState !== "visible" ||
        pathname === lastTrackedPath.current
      )
        return;

      const firstPage = lastTrackedPath.current === null;
      lastTrackedPath.current = pathname;
      const route = goatCounterRoute(pathname, locale);
      if (!route) return;

      const url = new URL("/count", goatCounterOrigin);
      url.searchParams.set("p", route);
      if (firstPage && /^https?:\/\//i.test(document.referrer)) {
        const { origin } = new URL(document.referrer);
        if (origin !== location.origin) url.searchParams.set("r", origin);
      }

      // Send only fields we control. The stock script includes the raw query string.
      void fetch(url, {
        mode: "no-cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    };

    count();
    document.addEventListener("visibilitychange", count);
    return () => document.removeEventListener("visibilitychange", count);
  }, [locale, pathname]);

  return null;
}
