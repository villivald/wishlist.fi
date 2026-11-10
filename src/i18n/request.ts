import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./config";
import { clientCatalog } from "./text";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = resolveLocale(await requestLocale);
  return {
    locale,
    messages: clientCatalog(locale),
    timeZone: "UTC",
  };
});
