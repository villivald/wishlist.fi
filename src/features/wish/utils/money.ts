import { languageTag } from "@/i18n/config";
import type { createTranslator } from "@/i18n/translator";

export const currencies = ["EUR", "USD", "GBP"] as const;

export type WishCurrency = (typeof currencies)[number];

export const MAX_PRICE_MINOR = 2_147_483_647;

const currencyFormatters = new Map<string, Intl.NumberFormat>();

const getCurrencyFormatter = (locale: string, currency: WishCurrency) => {
  const tag = languageTag(locale);
  const key = `${tag}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      currencyDisplay: "code",
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
};

export const parsePriceMinor = (value: string): number | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(trimmed)) {
    throw new Error(
      "Use a non-negative price with at most two decimal places.",
    );
  }

  const [whole, fraction = ""] = trimmed.split(/[.,]/);
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(amount) || amount > MAX_PRICE_MINOR) {
    throw new Error("Use a price no higher than 21,474,836.47.");
  }

  return amount;
};

export const priceInputValue = (amount: number | null) =>
  amount === null ? "" : (amount / 100).toFixed(2);

export const formatWishPrice = (
  amount: number | null,
  currency: WishCurrency | null,
  t: ReturnType<typeof createTranslator>,
) => {
  if (amount === null || currency === null) {
    return t("No price added");
  }

  return getCurrencyFormatter(t.locale, currency).format(amount / 100);
};
