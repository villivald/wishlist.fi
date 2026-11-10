import { languageTag } from "./config";
import { type MessageCode, messageCodes } from "./message-codes";
import type english from "./messages/en.json";

export type TextKey = keyof typeof english;
export type TextValues = Record<string, string | number>;

const numberFormatters = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

const getNumberFormatter = (locale: string) => {
  const tag = languageTag(locale);
  let formatter = numberFormatters.get(tag);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag);
    numberFormatters.set(tag, formatter);
  }
  return formatter;
};

const getPluralRules = (locale: string) => {
  const tag = languageTag(locale);
  let rules = pluralRules.get(tag);
  if (!rules) {
    rules = new Intl.PluralRules(tag);
    pluralRules.set(tag, rules);
  }
  return rules;
};

// next-intl rejects "." in message keys in development mode; clientCatalog encodes "." as U+2024.
export const encodeCatalogKey = (key: string) => key.replaceAll(".", "\u2024");

const lookupCatalog = (
  catalog: Record<string, string>,
  key: string,
): string | undefined => {
  if (Object.hasOwn(catalog, key)) return catalog[key];
  const encoded = encodeCatalogKey(key);
  if (Object.hasOwn(catalog, encoded)) return catalog[encoded];
  return undefined;
};

// English source messages are stable catalog keys; user content is never passed here.
export const createTranslator = (
  locale: string,
  catalog: Record<string, string>,
) => {
  const translate = (key: TextKey, values: TextValues = {}): string => {
    const message = lookupCatalog(catalog, key) ?? key;
    return message.replace(/\{(\w+)\}/g, (_match, name: string) =>
      typeof values[name] === "number"
        ? getNumberFormatter(locale).format(values[name])
        : String(values[name] ?? `{${name}}`),
    );
  };

  return Object.assign(translate, {
    locale,
    plural: (one: TextKey, other: TextKey, count: number) =>
      translate(getPluralRules(locale).select(count) === "one" ? one : other, {
        count,
      }),
    message: (message: string) =>
      lookupCatalog(catalog, message) !== undefined
        ? translate(message as TextKey)
        : message,
    feedback: (state: { message: string; messageCode?: MessageCode }) =>
      state.messageCode
        ? translate(messageCodes[state.messageCode])
        : lookupCatalog(catalog, state.message) !== undefined
          ? translate(state.message as TextKey)
          : state.message,
  });
};
