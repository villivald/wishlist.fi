import { headers } from "next/headers";
import { after } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goatCounterRoute } from "@/features/analytics/routes";
import { trackSignUp } from "@/features/analytics/sign-up";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

describe("GoatCounter page labels", () => {
  it.each([
    ["/en?ref=private-query", "en", "/en"],
    [
      "/fi/lists/private-id/wishes/wish-id/edit#private-fragment",
      "fi",
      "/fi/lists/[id]/wishes/[id]/edit",
    ],
    ["/en/guest/lists/private-id", "en", "/en/guest/lists/[id]"],
    ["/en/password-reset/private-token", "en", "/en/password-reset/[token]"],
    ["/en/account/checkout?customer=private-id", "en", "/en/account/checkout"],
    ["/en/unrecognized/private-value", "en", "/en/other"],
    ["/fi/guest/#private-token", "fi", null],
  ] as const)("normalizes %s", (path, locale, label) => {
    expect(goatCounterRoute(path, locale)).toBe(label);
  });
});

describe("GoatCounter sign-ups", () => {
  const send = vi.fn(async () => new Response(null, { status: 202 }));
  const runAfter = async () => {
    const callback = vi.mocked(after).mock.calls[0][0];
    expect(typeof callback).toBe("function");
    if (typeof callback === "function") await callback();
  };

  beforeEach(() => {
    vi.stubEnv("GOATCOUNTER_ENABLED", "1");
    vi.stubEnv("GOATCOUNTER_API_TOKEN", "test-count-key");
    vi.stubGlobal("fetch", send);
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends only an aggregate event after the response", async () => {
    trackSignUp();
    expect(send).not.toHaveBeenCalled();
    await runAfter();
    expect(send).toHaveBeenCalledExactlyOnceWith(
      new URL("https://wishlist.goatcounter.com/api/v0/count"),
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-count-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          no_sessions: true,
          hits: [{ path: "signup", title: "Account created", event: true }],
        }),
      }),
    );
  });

  it.each(["DNT", "Sec-GPC"])("skips when %s is enabled", async (name) => {
    vi.mocked(headers).mockResolvedValue(new Headers({ [name]: "1" }));
    trackSignUp();
    await runAfter();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["GOATCOUNTER_ENABLED", "0"],
    ["GOATCOUNTER_API_TOKEN", ""],
  ])("skips when %s is inactive", (name, value) => {
    vi.stubEnv(name, value);
    trackSignUp();
    expect(after).not.toHaveBeenCalled();
  });
});
