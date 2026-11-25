"use server";

import { getLocale } from "next-intl/server";
import {
  type ActionState,
  toActionState,
} from "@/components/form/utils/to-action-state";
import { trackSignUp } from "@/features/analytics/sign-up";
import { Prisma } from "@/generated/prisma/client";
import { resolveLocale } from "@/i18n/config";
import { redirect } from "@/i18n/server-navigation";
import { emailVerificationPath } from "@/paths";
import { register } from "../service/accounts";
import { authActionError } from "../service/action-error";
import { verifyAccountChallenge } from "../service/bot-protection";
import { requestVerificationEmail } from "../service/email-requests";
import {
  limitAccountEmailSource,
  limitAuthRequest,
} from "../service/request-limit";
import { signUpSchema } from "../service/schemas";
import { authReturnPath } from "../utils/return-to";
import { setSessionCookie } from "../utils/session-cookie";

export const signUp = async (_state: ActionState, data: FormData) => {
  try {
    const input = signUpSchema.parse(Object.fromEntries(data));
    await verifyAccountChallenge(data, "sign_up");
    await limitAccountEmailSource(true);
    await limitAuthRequest("sign-up", input.email, 5);

    const result = await register({
      ...input,
      locale: resolveLocale(await getLocale()),
    });
    trackSignUp();

    await setSessionCookie(result.token, result.session.expiresAt);
    try {
      await requestVerificationEmail(result.user);
    } catch {
      // Account and session remain usable; the verification page offers resend.
      console.error("Initial verification email failed; resend is available");
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return toActionState(
        "ERROR",
        "Unable to register with these details. Try signing in or recovering your password.",
        data,
      );
    }

    return authActionError(error, data);
  }

  return await redirect(
    authReturnPath(emailVerificationPath, data.get("returnTo")),
  );
};
