"use client";

import { useLocale } from "next-intl";
import { useSyncExternalStore } from "react";
import { languageTag } from "@/i18n/config";

const subscribe = () => () => {};
const options: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
};
const dateOnlyOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

const getDateFormatter = (
  locale: string,
  displayOptions: Intl.DateTimeFormatOptions,
  utc = false,
) => {
  const key = `${locale}:${displayOptions === dateOnlyOptions ? "date" : "full"}:${utc ? "utc" : "local"}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(
      locale,
      utc ? { ...displayOptions, timeZone: "UTC" } : displayOptions,
    );
    dateFormatters.set(key, formatter);
  }
  return formatter;
};

export function LocalTime({
  value,
  dateOnly = false,
}: {
  value: string;
  dateOnly?: boolean;
}) {
  const locale = languageTag(useLocale());
  const displayOptions = dateOnly ? dateOnlyOptions : options;
  const date = new Date(value);
  const fallback = getDateFormatter(locale, displayOptions, true).format(date);
  const label = useSyncExternalStore(
    subscribe,
    () => getDateFormatter(locale, displayOptions, false).format(date),
    () => fallback,
  );

  return (
    <time
      dateTime={value}
      title={getDateFormatter(locale, options, true).format(date)}
    >
      {label}
    </time>
  );
}
