import { cache } from "react";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";
import { resolveLocale } from "@/i18n/config";
import { curatedWishlistCopy } from "./curated-copy";

export const curatedListSettings = {
  publication: "PUBLISHED",
  visibility: "PUBLIC",
  reservationsEnabled: false,
} as const;

type CopyKey = keyof typeof curatedWishlistCopy;

const isCopyKey = (key: string): key is CopyKey =>
  Object.hasOwn(curatedWishlistCopy, key);

const readCuratedWishlists = cache(() => {
  const lists = new Map<string, CopyKey | undefined>();
  for (const entry of (process.env.CURATED_WISHLIST_IDS ?? "").split(",")) {
    const [id, key = "", ...extra] = entry
      .split(":")
      .map((part) => part.trim());
    if (!wishlistIdSchema.safeParse(id).success || lists.has(id)) continue;
    lists.set(id, !extra.length && isCopyKey(key) ? key : undefined);
  }
  return lists;
});

export const readCuratedWishlistIds = () => [...readCuratedWishlists().keys()];

type ListEligibility = {
  id: string;
  publication: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "PRIVATE";
  reservationsEnabled: boolean;
};

export const isCuratedWishlist = (list: ListEligibility) =>
  list.publication === curatedListSettings.publication &&
  list.visibility === curatedListSettings.visibility &&
  list.reservationsEnabled === curatedListSettings.reservationsEnabled &&
  readCuratedWishlists().has(list.id);

export const getCuratedWishlistCopy = (
  list: ListEligibility,
  locale: string,
) => {
  const key = isCuratedWishlist(list)
    ? readCuratedWishlists().get(list.id)
    : undefined;
  return key ? curatedWishlistCopy[key][resolveLocale(locale)] : undefined;
};

export const findCuratedWishlistIdsByCopy = (query: string) => {
  const term = query.toLowerCase();
  return [...readCuratedWishlists()].flatMap(([id, key]) =>
    key &&
    Object.values(curatedWishlistCopy[key]).some(({ title, description }) =>
      [title, description].some((text) => text.toLowerCase().includes(term)),
    )
      ? [id]
      : [],
  );
};
