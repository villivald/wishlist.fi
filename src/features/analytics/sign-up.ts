import { headers } from "next/headers";
import { after } from "next/server";
import { goatCounterEnabled, goatCounterOrigin } from "./config";

export const trackSignUp = () => {
  const token = process.env.GOATCOUNTER_API_TOKEN?.trim();
  if (!goatCounterEnabled() || !token) return;

  after(async () => {
    try {
      const requestHeaders = await headers();
      if (
        requestHeaders.get("DNT") === "1" ||
        requestHeaders.get("Sec-GPC") === "1"
      )
        return;

      const response = await fetch(
        new URL("/api/v0/count", goatCounterOrigin),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            no_sessions: true,
            hits: [{ path: "signup", title: "Account created", event: true }],
          }),
          redirect: "error",
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok) console.error("GoatCounter sign-up event failed");
    } catch {
      console.error("GoatCounter sign-up event failed");
    }
  });
};
