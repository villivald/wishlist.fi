"use server";

import { z } from "zod";
import {
  type ActionState,
  fromErrorToActionState,
  toActionState,
} from "@/components/form/utils/to-action-state";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { AuthError } from "@/features/auth/service/security";
import { MAX_IMAGE_BYTES, MediaError } from "@/features/media/types";
import { WishlistError } from "@/features/wishlist/service/lists";
import { redirect, revalidatePath } from "@/i18n/server-navigation";
import {
  browsePath,
  favoritesPath,
  listPath,
  listsPath,
  reservationsPath,
  wishPath,
} from "@/paths";
import { transferWishes } from "../service/transfer";
import {
  createWish,
  deleteWish,
  transitionWish,
  updateWish,
  WishError,
} from "../service/wishes";
import type { WishTransferOperation } from "../transfer";

const wishInput = (data: FormData) => ({
  title: data.get("title"),
  description: data.get("description") ?? "",
  externalUrl: data.get("externalUrl") ?? "",
  price: data.get("price") ?? "",
  currency: data.get("currency") ?? "",
  priority: data.get("priority") ?? "",
  hidden: data.get("hidden") === "on",
});

const actionError = (error: unknown, data?: FormData) => {
  if (
    error instanceof WishError ||
    error instanceof WishlistError ||
    error instanceof MediaError ||
    error instanceof AuthError
  ) {
    return toActionState("ERROR", error.message, data);
  }

  return fromErrorToActionState(error, data);
};

const refreshWish = (listId: string, wishId: string) => {
  revalidatePath(listsPath);
  revalidatePath(browsePath);
  revalidatePath(reservationsPath);
  revalidatePath(listPath(listId));
  revalidatePath(wishPath(listId, wishId));
  revalidatePath(`${wishPath(listId, wishId)}/edit`);
  revalidatePath(`${wishPath(listId, wishId)}/delete`);
};

export const submitWishTransfer = async (
  operation: WishTransferOperation,
  listId: string,
  wishId: string,
  requestId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();
  const destinations = data
    .getAll("destination")
    .map((choice) => (typeof choice === "string" ? choice.split(":") : []));
  let results: Awaited<ReturnType<typeof transferWishes>>;

  try {
    results = await transferWishes(
      user.id,
      listId,
      wishId,
      operation,
      destinations,
      requestId,
    );
  } catch (error) {
    return actionError(error);
  }

  if (operation === "move") {
    refreshWish(listId, wishId);
    revalidatePath(favoritesPath);
  }
  for (const result of results) refreshWish(result.destinationId, result.id);
  if (results.length > 1)
    return await redirect(
      `${wishPath(listId, wishId)}?copies=${results.length}`,
      "replace",
    );
  const result = results[0]!;
  return await redirect(
    `${wishPath(result.destinationId, result.id)}?${operation === "move" ? "moved" : "copied"}=1`,
    "replace",
  );
};

export const addWish = async (
  listId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();
  let id: string;
  const payload = new FormData();
  for (const [name, value] of data) {
    if (typeof value === "string") payload.append(name, value);
  }

  try {
    const file = data.get("image");
    if (file instanceof File && file.size > MAX_IMAGE_BYTES) {
      throw new MediaError("Choose an image up to 3 MB.");
    }
    ({ id } = await createWish(
      user.id,
      listId,
      wishInput(data),
      file instanceof File && file.size
        ? {
            bytes: Buffer.from(await file.arrayBuffer()),
            alt: String(data.get("imageAlt") ?? ""),
          }
        : undefined,
    ));
  } catch (error) {
    return actionError(error, payload);
  }

  refreshWish(listId, id);
  return await redirect(`${wishPath(listId, id)}?created=1`);
};

export const editWish = async (
  listId: string,
  wishId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();
  const payload = new FormData();
  for (const [name, value] of data) {
    if (typeof value === "string") payload.append(name, value);
  }

  try {
    const file = data.get("image");
    if (file instanceof File && file.size > MAX_IMAGE_BYTES)
      throw new MediaError("Choose an image up to 3 MB.");
    await updateWish(
      user.id,
      listId,
      wishId,
      wishInput(data),
      file instanceof File && file.size
        ? {
            bytes: Buffer.from(await file.arrayBuffer()),
            alt: String(data.get("imageAlt") ?? ""),
          }
        : data.get("removeImage") === "on"
          ? null
          : undefined,
    );
  } catch (error) {
    return actionError(error, payload);
  }

  refreshWish(listId, wishId);
  return await redirect(`${wishPath(listId, wishId)}?saved=1`);
};

export const changeWishState = async (
  listId: string,
  wishId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();

  try {
    await transitionWish(user.id, listId, wishId, data.get("transition"));
  } catch (error) {
    return actionError(error);
  }

  refreshWish(listId, wishId);

  return toActionState("SUCCESS", "Wish updated.");
};

export const removeWish = async (
  listId: string,
  wishId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect();

  try {
    z.literal("delete", {
      error: "Confirm that you want to delete this wish.",
    }).parse(data.get("confirm"));
    await deleteWish(user.id, listId, wishId);
  } catch (error) {
    return actionError(error);
  }

  refreshWish(listId, wishId);
  return await redirect(`${listPath(listId)}?wishDeleted=1`);
};
