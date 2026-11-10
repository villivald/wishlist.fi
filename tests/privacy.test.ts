import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import GoogleTagManager from "@/components/google-tag-manager";
import {
  googleConsent,
  readPrivacyPreferences,
  serializePrivacyPreferences,
} from "@/features/privacy/preferences";
import {
  isMarketingPath,
  sanitizeMarketingEvent,
} from "@/features/privacy/routes";

describe("optional tracking boundaries", () => {
  it("does not authorize Google storage with Vercel-only consent", () => {
    expect(googleConsent({ analytics: true, marketing: false })).toEqual({
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  });
  it("defaults to no consent for missing, old, or malformed preferences", () => {
    for (const value of [
      undefined,
      "",
      "true",
      "v0.a1.m1",
      "v1.a2.m1",
      "v1.a1.m1.extra",
    ])
      expect(readPrivacyPreferences(value)).toBeNull();
    for (const analytics of [true, false])
      for (const marketing of [true, false]) {
        const preferences = { analytics, marketing };
        expect(
          readPrivacyPreferences(serializePrivacyPreferences(preferences)),
        ).toEqual(preferences);
      }
  });

  it("allows only static public information routes and removes URL details", () => {
    for (const pathname of [
      "/",
      "/en",
      "/fi/premium",
      "/en/privacy",
      "/fi/about",
    ])
      expect(isMarketingPath(pathname)).toBe(true);
    for (const pathname of [
      "/en/browse",
      "/fi/lists/private-id",
      "/guest",
      "/en/guest/lists/id",
      "/fi/account/checkout",
      "/en/password-reset/secret",
      "/fi/invitations/secret",
      "/en/unknown",
      "//example.com",
    ])
      expect(isMarketingPath(pathname)).toBe(false);
    expect(
      sanitizeMarketingEvent({
        type: "pageview",
        url: "https://wishlist.fi/fi/premium?search=private#secret",
      }),
    ).toEqual({ type: "pageview", url: "https://wishlist.fi/fi/premium" });
    for (const url of [
      "invalid",
      "https://wishlist.fi/en/account/checkout?checkout=secret",
      "https://wishlist.fi/en/guest#secret",
    ])
      expect(sanitizeMarketingEvent({ url })).toBeNull();
  });

  it("queues default and chosen consent before GTM starts or loads", () => {
    const window = { dataLayer: [] as unknown[] };
    const inserted: { src?: string; async?: boolean }[] = [];
    const script = GoogleTagManager({ analytics: false }).props.children;
    runInNewContext(script, {
      window,
      document: {
        createElement: () => ({}),
        head: {
          appendChild: (element: { src: string; async: boolean }) => {
            expect(window.dataLayer).toHaveLength(3);
            inserted.push(element);
          },
        },
      },
    });
    const entries = window.dataLayer
      .slice(0, 2)
      .map((entry) => Array.from(entry as ArrayLike<unknown>));
    expect(entries).toEqual([
      [
        "consent",
        "default",
        googleConsent({ analytics: false, marketing: false }),
      ],
      [
        "consent",
        "update",
        googleConsent({ analytics: false, marketing: true }),
      ],
    ]);
    expect(window.dataLayer[2]).toMatchObject({
      event: "gtm.js",
      "gtm.start": expect.any(Number),
    });
    expect(inserted).toEqual([
      {
        src: "https://www.googletagmanager.com/gtm.js?id=GTM-MWND8GRB",
        async: true,
      },
    ]);
  });
});
