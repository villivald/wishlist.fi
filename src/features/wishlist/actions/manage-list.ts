"use server";

import { z } from "zod";
import {
  type ActionState,
  fromErrorToActionState,
  toActionState,
} from "@/components/form/utils/to-action-state";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { PremiumError } from "@/features/premium/service/entitlements";
import { listAccessSchema } from "@/features/sharing/service/schemas";
import { redirect, revalidatePath } from "@/i18n/server-navigation";
import { browsePath, listPath, listsPath, reservationsPath } from "@/paths";
import type { ListAccess } from "../list-access";
import {
  createWishlist,
  deleteWishlist,
  ReservationReviewRequired,
  type ReservedWish,
  setWishlistPublication,
  updateWishlist,
  WishlistError,
} from "../service/lists";

const listInput = (data: FormData) => ({
  theme: data.get("theme") ?? undefined,
  title: data.get("title"),
  description: data.get("description") ?? "",
  reservationsEnabled: data.get("reservationsEnabled") === "on",
});

const actionError = (error: unknown, data?: FormData) => {
  if (error instanceof WishlistError || error instanceof PremiumError) {
    return toActionState("ERROR", error.message, data);
  }

  return fromErrorToActionState(error, data);
};

const refreshList = (id: string) => {
  revalidatePath(browsePath);
  revalidatePath(reservationsPath);
  revalidatePath(listsPath);
  revalidatePath(listPath(id));
  revalidatePath(`${listPath(id)}/edit`);
  revalidatePath(`${listPath(id)}/delete`);
  revalidatePath("/lists/[listId]/wishes/[wishId]", "page");
};

export const createList = async (_state: ActionState, data: FormData) => {
  const { user } = await getAuthOrRedirect();
  let id: string;

  try {
    const access = data.has("access")
      ? listAccessSchema.parse(data.get("access"))
      : undefined;
    ({ id } = await createWishlist(user.id, {
      ...listInput(data),
      visibility: access
        ? access === "PRIVATE"
          ? "PRIVATE"
          : "PUBLIC"
        : (data.get("visibility") ?? "PUBLIC"),
      publication: access
        ? access === "HIDDEN"
          ? "DRAFT"
          : "PUBLISHED"
        : (data.get("publication") ?? "PUBLISHED"),
    }));
  } catch (error) {
    return actionError(error, data);
  }

  revalidatePath(listsPath);
  return await redirect(`${listPath(id)}?created=1`);
};

export const updateList = async (
  id: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();

  try {
    await updateWishlist(user.id, id, listInput(data));
  } catch (error) {
    return actionError(error, data);
  }

  refreshList(id);
  return toActionState("SUCCESS", "Changes saved.");
};

export type PublicationState = ActionState & {
  reservationReview?: ReservedWish[];
  expectedAccess?: ListAccess;
};

export const changePublication = async (
  id: string,
  _state: PublicationState,
  data: FormData,
): Promise<PublicationState> => {
  const { user } = await getAuthOrRedirect();

  let endedReservations = 0;
  let expectedAccess: ListAccess | undefined;
  try {
    expectedAccess = listAccessSchema
      .optional()
      .parse(data.get("expectedAccess") ?? undefined);
    const confirmed = z
      .array(z.string().max(200))
      .max(10000)
      .parse(data.getAll("confirmedReservation"));
    ({ endedReservations } = await setWishlistPublication(
      user.id,
      id,
      data.get("publication"),
      confirmed,
      expectedAccess,
    ));
  } catch (error) {
    if (error instanceof ReservationReviewRequired)
      return {
        ...toActionState("REVIEW", ""),
        reservationReview: error.reservations,
        expectedAccess,
      };
    return actionError(error);
  }

  refreshList(id);

  return toActionState(
    "SUCCESS",
    data.get("publication") === "PUBLISHED"
      ? "List is now visible."
      : endedReservations > 0
        ? "List hidden from viewers. Active reservations have ended."
        : "List hidden from viewers.",
  );
};

export const deleteList = async (
  id: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();

  try {
    z.literal("delete", {
      error: "Confirm that you want to delete this list.",
    }).parse(data.get("confirm"));
    await deleteWishlist(user.id, id);
  } catch (error) {
    return actionError(error);
  }

  refreshList(id);
  return await redirect(`${listsPath}?deleted=1`);
};
