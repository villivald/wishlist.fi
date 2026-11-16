import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { getCanonicalUrl } from "@/lib/search-indexing";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/premium"].flatMap((path) =>
    locales.map((locale) => ({
      url: getCanonicalUrl(path, locale),
      alternates: {
        languages: Object.fromEntries(
          locales.map((language) => [
            language,
            getCanonicalUrl(path, language),
          ]),
        ),
      },
    })),
  );
}
