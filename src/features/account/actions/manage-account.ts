"use server";

import { ZodError } from "zod";
import {
  type ActionState,
  toActionState,
} from "@/components/form/utils/to-action-state";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import { authActionError } from "@/features/auth/service/action-error";
import { limitSourceRequest } from "@/features/auth/service/request-limit";
import { deleteSessionCookie } from "@/features/auth/utils/session-cookie";
import { PremiumError } from "@/features/premium/service/entitlements";
import { redirect, revalidatePath } from "@/i18n/server-navigation";
import { accountProfilePath, browsePath, signInPath } from "@/paths";
import { deleteAccount, updateProfile } from "../service/account";

export const saveProfile = async (_state: ActionState, data: FormData) => {
  const { user, session } = await getAuthOrRedirect();

  try {
    await limitSourceRequest("profile-change");
    await updateProfile(user.id, session.id, {
      ...Object.fromEntries(data),
      showPremiumBadge: data.get("showPremiumBadge") === "on",
    });
  } catch (error) {
    if (error instanceof PremiumError)
      return toActionState("ERROR", error.message, data);
    return authActionError(error, data);
  }

  revalidatePath(accountProfilePath);
  revalidatePath(browsePath);
  return toActionState("SUCCESS", "Profile saved.");
};

export const removeAccount = async (_state: ActionState, data: FormData) => {
  const { user, session } = await getAuthOrRedirect();

  try {
    await limitSourceRequest("account-delete");
    await deleteAccount(user.id, session.id, Object.fromEntries(data));
  } catch (error) {
    if (error instanceof ZodError) {
      return toActionState(
        "ERROR",
        "Confirm your identity, type DELETE, and refresh the deletion summary if needed.",
      );
    }
    return authActionError(error);
  }

  await deleteSessionCookie();
  revalidatePath("/", "layout");
  return await redirect(`${signInPath}?deleted=1`);
};
