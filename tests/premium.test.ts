import { describe, expect, it } from "vitest";
import { continuousPremiumUntil } from "@/features/premium/service/period";
import {
  promoInputSchema,
  promoIssueSchema,
} from "@/features/premium/service/schemas";

const date = (day: number) => new Date(Date.UTC(2026, 0, day));
const period = (start: number, end: number) => ({
  startsAt: date(start),
  expiresAt: date(end),
});

describe("Premium periods", () => {
  it("merges overlapping, nested and adjacent periods without mutating input", () => {
    const periods = [period(7, 10), period(1, 5), period(3, 7), period(2, 4)];
    const original = structuredClone(periods);
    expect(continuousPremiumUntil(periods, date(2))).toEqual(date(10));
    expect(periods).toEqual(original);
  });

  it("never bridges a gap or activates future access early", () => {
    expect(
      continuousPremiumUntil([period(1, 3), period(4, 8)], date(2)),
    ).toEqual(date(3));
    expect(continuousPremiumUntil([period(4, 8)], date(2))).toBeNull();
  });

  it("treats start as inclusive and expiry as exclusive", () => {
    expect(continuousPremiumUntil([period(1, 3)], date(1))).toEqual(date(3));
    expect(continuousPremiumUntil([period(1, 3)], date(3))).toBeNull();
    expect(continuousPremiumUntil([], date(1))).toBeNull();
  });
});

describe("promo validation", () => {
  it("accepts copied spacing, hyphens and lowercase", () => {
    expect(promoInputSchema.parse(` wl-${"abcdefgh-".repeat(4)} `)).toBe(
      `WL${"ABCDEFGH".repeat(4)}`,
    );
  });

  it.each([
    [" wishlist-30 ", "WISHLIST30"],
    ["Wishlist-Fi-Welcome", "WISHLISTFIWELCOME"],
  ])("normalizes public campaign code %s", (input, normalized) => {
    expect(promoInputSchema.parse(input)).toBe(normalized);
  });

  it.each([
    "SHORT",
    "A".repeat(33),
    "123456",
    "WISHLIST_30",
    "WISHLIST/30",
    "WISHLIST🎁",
    "TERVETULOÄ",
    "WLWELCOME",
  ])("rejects invalid public campaign code %s", (input) => {
    expect(promoInputSchema.safeParse(input).success).toBe(false);
  });

  it.each(["", "WL-0".repeat(10), `WL${"A".repeat(31)}`, "A".repeat(97), null])(
    "rejects malformed codes",
    (input) => {
      expect(promoInputSchema.safeParse(input).success).toBe(false);
    },
  );

  it("bounds issuance duration, validity and total uses", () => {
    const input = {
      label: " Trial ",
      durationDays: 30,
      validForDays: 7,
      maxRedemptions: 1,
    };
    expect(promoIssueSchema.parse(input).label).toBe("Trial");
    expect(promoIssueSchema.parse({ ...input, code: "wishlist-30" }).code).toBe(
      "WISHLIST30",
    );
    for (const override of [
      { label: " " },
      { code: "" },
      { code: "WLWELCOME" },
      { durationDays: 0 },
      { durationDays: 366 },
      { validForDays: 366 },
      { maxRedemptions: 10001 },
      { maxRedemptions: 1.5 },
    ]) {
      expect(
        promoIssueSchema.safeParse({ ...input, ...override }).success,
      ).toBe(false);
    }
  });
});
