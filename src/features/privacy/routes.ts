import { withoutLocale } from "@/i18n/config";

const marketingPaths = new Set([
  "/",
  "/premium",
  "/about",
  "/accessibility",
  "/privacy",
  "/terms",
  "/refunds",
  "/site-map",
]);

export const isMarketingPath = (pathname: string) =>
  marketingPaths.has(withoutLocale(pathname));

export const sanitizeMarketingEvent = <T extends { url: string }>(event: T) => {
  try {
    const url = new URL(event.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !isMarketingPath(url.pathname)
    )
      return null;
    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
};
