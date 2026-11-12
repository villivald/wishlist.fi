import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/features/auth/actions/get-auth";
import { requestVerificationEmail } from "@/features/auth/service/email-requests";
import {
  consumeGoogleRequest,
  exchangeGoogleCode,
  finishGoogleSignIn,
  GOOGLE_FLOW_COOKIE,
  GoogleAuthError,
  googleConfig,
  googleDestination,
} from "@/features/auth/service/google";
import { limitSourceRequest } from "@/features/auth/service/request-limit";
import { authReturnPath } from "@/features/auth/utils/return-to";
import { setSessionCookie } from "@/features/auth/utils/session-cookie";
import { localizedPath } from "@/i18n/config";
import { emailVerificationPath, signInPath } from "@/paths";

export async function GET(request: Request) {
  const config = googleConfig();
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!config) return new Response(null, { status: 404, headers });
  let destination = "/en/sign-in";
  let returnTo: string | undefined;
  try {
    await limitSourceRequest("google-callback", 60);
    const url = new URL(request.url);
    const jar = await cookies();
    const flow = await consumeGoogleRequest(
      url.searchParams.get("state") ?? "",
      jar.get(GOOGLE_FLOW_COOKIE)?.value,
    );
    jar.delete({ name: GOOGLE_FLOW_COOKIE, path: "/api/auth/google" });
    destination = localizedPath(
      flow.intent === "sign-in" ? signInPath : flow.returnTo,
      flow.locale,
    );
    returnTo = flow.returnTo;
    if (url.searchParams.has("error")) {
      const canceled = new URL(destination, config.origin);
      canceled.searchParams.set("google", "canceled");
      if (flow.intent === "sign-in")
        canceled.searchParams.set("returnTo", returnTo);
      return NextResponse.redirect(canceled, { status: 303, headers });
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) throw new GoogleAuthError();
    const identity = await exchangeGoogleCode(
      code,
      flow.codeVerifier,
      flow.nonce,
    );
    const auth = flow.intent === "sign-in" ? null : await getAuth();
    const result = await finishGoogleSignIn(identity, flow, auth?.session?.id);
    await setSessionCookie(result.token, result.session.expiresAt);
    if (!result.user.emailVerified) {
      try {
        await requestVerificationEmail(result.user);
      } catch {
        /* The verification page provides resend. */
      }
      return NextResponse.redirect(
        new URL(
          localizedPath(
            authReturnPath(emailVerificationPath, flow.returnTo),
            flow.locale,
          ),
          config.origin,
        ),
        { status: 303, headers },
      );
    }
    return NextResponse.redirect(
      new URL(
        flow.intent === "sign-in"
          ? googleDestination(flow.locale, flow.returnTo)
          : localizedPath(flow.returnTo, flow.locale),
        config.origin,
      ),
      { status: 303, headers },
    );
  } catch (error) {
    const target = new URL(destination, config.origin);
    target.searchParams.set(
      "google",
      error instanceof GoogleAuthError ? error.code : "failed",
    );
    if (returnTo && destination.endsWith("/sign-in"))
      target.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(target, { status: 303, headers });
  }
}
