import { wishlistIdSchema } from "@/features/wishlist/service/schemas";

export const curatedListSettings = {
  publication: "PUBLISHED",
  visibility: "PUBLIC",
  reservationsEnabled: false,
} as const;

export const readCuratedWishlistIds = () => [
  ...new Set(
    (process.env.CURATED_WISHLIST_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => wishlistIdSchema.safeParse(id).success),
  ),
];

export const isCuratedWishlist = (list: {
  id: string;
  publication: "DRAFT" | "PUBLISHED";
  visibility: "PUBLIC" | "PRIVATE";
  reservationsEnabled: boolean;
}) =>
  list.publication === curatedListSettings.publication &&
  list.visibility === curatedListSettings.visibility &&
  list.reservationsEnabled === curatedListSettings.reservationsEnabled &&
  readCuratedWishlistIds().includes(list.id);
