"use server";

import {
  type ActionState,
  toActionState,
} from "@/components/form/utils/to-action-state";
import { getAuthOrRedirect } from "../queries/get-auth-or-redirect";
import { authActionError } from "../service/action-error";
import { requestPasswordRecovery } from "../service/email-requests";
import {
  limitAccountEmailSource,
  limitAuthRequest,
} from "../service/request-limit";

export async function requestPasswordSetup(_state: ActionState) {
  const { user } = await getAuthOrRedirect();
  try {
    await limitAccountEmailSource();
    await limitAuthRequest("password-setup", user.id, 3);
    await requestPasswordRecovery(user.email);
    return toActionState(
      "SUCCESS",
      "If a new link can be sent, it will arrive at your account email. Use the latest link to set a password.",
    );
  } catch (error) {
    return authActionError(error);
  }
}
