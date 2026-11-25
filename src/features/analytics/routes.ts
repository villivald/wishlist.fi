import { normalizePerformanceRoute } from "@/features/performance/routes";
import { type Locale, localizedPath, withoutLocale } from "@/i18n/config";

const additionalRoutes = [
  [/^\/account\/plan$/, "/account/plan"],
  [/^\/account\/checkout$/, "/account/checkout"],
  [/^\/guest\/lists\/[^/]+$/, "/guest/lists/[id]"],
  [/^\/guest\/lists\/[^/]+\/wishes\/[^/]+$/, "/guest/lists/[id]/wishes/[id]"],
  [/^\/invitations\/[^/]+$/, "/invitations/[id]"],
  [/^\/password-reset\/[^/]+$/, "/password-reset/[token]"],
  [/^\/lists\/[^/]+\/delete$/, "/lists/[id]/delete"],
  [/^\/lists\/[^/]+\/wishes\/[^/]+\/delete$/, "/lists/[id]/wishes/[id]/delete"],
  [/^\/lists\/[^/]+\/wishes\/[^/]+\/move$/, "/lists/[id]/wishes/[id]/move"],
  [/^\/lists\/[^/]+\/wishes\/[^/]+\/copy$/, "/lists/[id]/wishes/[id]/copy"],
] as const;

export const goatCounterRoute = (path: string, locale: Locale) => {
  const pathname =
    withoutLocale(path.split(/[?#]/, 1)[0]).replace(/\/$/, "") || "/";
  if (pathname === "/guest") return null;

  const route =
    normalizePerformanceRoute(pathname) ??
    additionalRoutes.find(([pattern]) => pattern.test(pathname))?.[1] ??
    "/other";
  return localizedPath(route, locale);
};
