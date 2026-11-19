"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  type ActionState,
  fromErrorToActionState,
  toActionState,
} from "@/components/form/utils/to-action-state";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { limitSourceRequest } from "@/features/auth/service/request-limit";
import { AuthError } from "@/features/auth/service/security";
import { redirect } from "@/i18n/server-navigation";
import { reservationGroupPath, reservationsPath, wishPath } from "@/paths";
import {
  enableReservationGroup,
  inviteToReservation,
  removeReservationParticipant,
  respondToReservation,
  transferReservation,
} from "../service/groups";
import {
  cancelReservation,
  ReservationError,
  reserveWish,
} from "../service/reservations";

const errorState = (error: unknown) =>
  error instanceof ReservationError || error instanceof AuthError
    ? toActionState("ERROR", error.message)
    : fromErrorToActionState(error);
const refresh = () => revalidatePath("/", "layout");
const consent = (data: FormData) => {
  if (data.get("confirm") !== "on")
    throw new ReservationError(
      "Confirm that your name and username will be shared with this group.",
    );
};

export const reserveWithGroup = async (
  listId: string,
  wishId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect({
    returnTo: wishPath(listId, wishId),
  });
  let id: string;
  try {
    consent(data);
    await limitSourceRequest("reservation-change");
    id = (await reserveWish(user.id, listId, wishId, true)).id;
  } catch (error) {
    return errorState(error);
  }
  refresh();
  return redirect(reservationGroupPath(id));
};

export const startGroup = async (
  reservationId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect({ returnTo: reservationsPath });
  try {
    consent(data);
    await limitSourceRequest("reservation-change");
    await enableReservationGroup(user.id, reservationId);
  } catch (error) {
    return errorState(error);
  }
  refresh();
  return redirect(reservationGroupPath(reservationId));
};

const operationSchema = z.enum([
  "invite",
  "accept",
  "decline",
  "remove",
  "leave",
  "transfer",
  "cancel",
]);
export const manageGroup = async (
  reservationId: string,
  _state: ActionState,
  data: FormData,
) => {
  const { user } = await getAuthOrRedirect({
    returnTo: reservationGroupPath(reservationId),
  });
  let leave = false;
  try {
    await limitSourceRequest("reservation-change");
    const operation = operationSchema.parse(data.get("operation"));
    const targetId = String(data.get("targetId") ?? "");
    if (operation === "invite")
      await inviteToReservation(
        user.id,
        reservationId,
        targetId || { email: String(data.get("email") ?? "") },
      );
    if (operation === "accept" || operation === "decline") {
      if (operation === "accept") consent(data);
      await respondToReservation(
        user.id,
        reservationId,
        operation === "accept",
      );
      leave = operation === "decline";
    }
    if (operation === "remove" || operation === "leave") {
      await removeReservationParticipant(
        user.id,
        reservationId,
        operation === "leave" ? user.id : targetId,
      );
      leave = operation === "leave";
    }
    if (operation === "transfer") {
      if (data.get("confirm") !== "on")
        throw new ReservationError("Confirm this change before continuing.");
      await transferReservation(user.id, reservationId, targetId);
    }
    if (operation === "cancel") {
      if (data.get("confirm") !== "on")
        throw new ReservationError("Confirm this change before continuing.");
      // The ordinary cancellation service rechecks organizer identity and the
      // reservation's exact parent, so forged IDs cannot cancel another group.
      const { readReservationGroup } = await import("../service/groups");
      const group = await readReservationGroup(user.id, reservationId);
      if (!group?.organizer)
        throw new ReservationError(
          "This group is unavailable or you no longer have access.",
        );
      await cancelReservation(
        user.id,
        group.wish.wishlistId,
        group.wish.id,
        reservationId,
      );
      leave = true;
    }
  } catch (error) {
    return errorState(error);
  }
  refresh();
  if (leave) return redirect(reservationsPath);
  return toActionState("SUCCESS", "Group reservation updated.");
};
