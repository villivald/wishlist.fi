import { localizedPath } from "@/i18n/config";
import { getBaseUrl } from "@/utils/url";

export const getCanonicalUrl = (path: string, locale: string) =>
  new URL(localizedPath(path, locale), getBaseUrl()).href;
