import { z } from "zod";
import { wishlistIdSchema } from "@/features/wishlist/service/schemas";

export const wishTransferOperation = z.enum(["move", "copy"]);
export type WishTransferOperation = z.infer<typeof wishTransferOperation>;

export const wishDestination = z.tuple([
  wishlistIdSchema,
  z.enum(["HIDDEN", "PRIVATE", "PUBLIC"]),
]);
