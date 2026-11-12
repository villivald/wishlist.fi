import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuth } from "@/features/auth/actions/get-auth";
import {
  createGoogleRequest,
  GOOGLE_FLOW_COOKIE,
  GOOGLE_FLOW_SECONDS,
  googleConfig,
  type GoogleIntent,
} from "@/features/auth/service/google";
import { GoogleAuthError } from "@/features/auth/service/google";
import { limitSourceRequest } from "@/features/auth/service/request-limit";
import { safeReturnTo } from "@/features/auth/utils/return-to";
import { localizedPath, resolveLocale } from "@/i18n/config";

export async function POST(request: Request) {
  const config = googleConfig();
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (!config) return new Response(null, { status: 404, headers });
  if (request.headers.get("origin") !== config.origin)
    return new Response(null, { status: 403, headers });
  const url = new URL(request.url);
  const locale = resolveLocale(url.searchParams.get("locale"));
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));
  try {
    await limitSourceRequest("google-start", 30);
    const intent = url.searchParams.get("intent") ?? "sign-in";
    if (!["sign-in", "connect", "delete"].includes(intent))
      return new Response(null, { status: 400, headers });
    const auth = intent === "sign-in" ? null : await getAuth();
    if (intent !== "sign-in" && !auth?.user?.emailVerified)
      throw new GoogleAuthError();
    const flow = await createGoogleRequest({
      intent: intent as GoogleIntent,
      locale,
      returnTo,
      sessionId: auth?.session?.id,
    });
    (await cookies()).set(GOOGLE_FLOW_COOKIE, flow.state, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.origin.startsWith("https:"),
      path: "/api/auth/google",
      maxAge: GOOGLE_FLOW_SECONDS,
    });
    return NextResponse.redirect(flow.url, { status: 303, headers });
  } catch {
    // Do not log authorization URLs, codes, identities, or credentials.
    const target = new URL(localizedPath("/sign-in", locale), config.origin);
    target.searchParams.set("google", "failed");
    target.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(target, { status: 303, headers });
  }
}
