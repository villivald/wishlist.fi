import { clientTextKeys } from "./client-keys";
import english from "./messages/en.json";
import finnish from "./messages/fi.json";
import {
  createTranslator,
  encodeCatalogKey,
  type TextKey,
  type TextValues,
} from "./translator";

export type { TextKey, TextValues };

const encodeCatalog = (entries: [string, string][]): Record<string, string> =>
  Object.fromEntries(
    entries.map(([key, value]) => [encodeCatalogKey(key), value]),
  );

const englishClientCatalog = encodeCatalog(
  clientTextKeys
    .filter((key) => english[key] !== key)
    .map((key) => [key, english[key]]),
);
const finnishClientCatalog = encodeCatalog(
  clientTextKeys.map((key) => [key, finnish[key]]),
);

export const catalog = (locale: string): Record<string, string> =>
  locale === "fi" ? finnish : english;

export const clientCatalog = (locale: string): Record<string, string> =>
  locale === "fi" ? finnishClientCatalog : englishClientCatalog;

// English source messages are stable catalog keys; user content is never passed here.
export const createText = (locale: string) =>
  createTranslator(locale, catalog(locale));

// Only application-owned messages cross this boundary; unknown provider details
// are already replaced with a generic message by the action error handlers.
export const translateMessage = (locale: string, message: string) =>
  Object.hasOwn(finnish, message)
    ? createText(locale)(message as TextKey)
    : message;
