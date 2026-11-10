import { describe, expect, it } from "vitest";
import { wishSchema } from "@/features/wish/service/schemas";
import {
  formatWishPrice,
  parsePriceMinor,
  priceInputValue,
} from "@/features/wish/utils/money";
import { createText } from "@/i18n/text";

describe("wish input", () => {
  it("accepts only a title and normalizes empty optional fields", () => {
    expect(wishSchema.parse({ title: "  A book  " })).toEqual({
      title: "A book",
      description: null,
      externalUrl: null,
      priceMinor: null,
      currency: null,
      priority: null,
      hidden: false,
    });
  });

  it.each(["EUR", "USD", "GBP"])(
    "accepts and displays %s without currency conversion",
    (currency) => {
      const wish = wishSchema.parse({
        title: "A book",
        price: "19.99",
        currency,
      });
      expect(wish.priceMinor).toBe(1999);
      expect(
        formatWishPrice(
          wish.priceMinor,
          wish.currency,
          createText("en"),
        ).replace(/\s/g, " "),
      ).toBe(`${currency} 19.99`);
    },
  );

  it.each([
    ["0", 0],
    [" 12,50 ", 1250],
    ["19.99", 1999],
    ["0.01", 1],
    ["21474836.47", 2147483647],
    ["", null],
  ])("parses %s into exact minor units", (input, expected) => {
    expect(parsePriceMinor(String(input))).toBe(expected);
  });

  it.each([
    "-1",
    "1.005",
    "1e2",
    "NaN",
    "Infinity",
    "1,234.56",
    "21474836.48",
    "99999999999999999999",
  ])("rejects invalid or out-of-range price %s", (price) => {
    expect(
      wishSchema.safeParse({ title: "A book", price, currency: "EUR" }).success,
    ).toBe(false);
  });

  it("distinguishes zero and missing prices and requires currency for a price", () => {
    expect(
      wishSchema.safeParse({ title: "Free book", price: "0" }).success,
    ).toBe(false);
    expect(
      wishSchema.parse({ title: "Free book", price: "0", currency: "EUR" })
        .priceMinor,
    ).toBe(0);
    expect(
      wishSchema.parse({ title: "A book", currency: "EUR" }),
    ).toMatchObject({ priceMinor: null, currency: null });
    expect(priceInputValue(0)).toBe("0.00");
    expect(priceInputValue(null)).toBe("");
    expect(formatWishPrice(null, null, createText("en"))).toBe(
      "No price added",
    );
  });

  it.each(["EUR", "USD", "GBP"])(
    "discards %s when the price is blank or whitespace",
    (currency) => {
      for (const price of ["", "   "]) {
        expect(
          wishSchema.parse({ title: "A book", price, currency }),
        ).toMatchObject({ priceMinor: null, currency: null });
      }
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "ftp://example.com",
    "//example.com",
    "https://name:password@example.com",
    "https://exam\nple.com",
  ])("rejects unsafe product link %s", (externalUrl) => {
    expect(wishSchema.safeParse({ title: "A book", externalUrl }).success).toBe(
      false,
    );
  });

  it("accepts and normalizes full HTTP(S) product links", () => {
    expect(
      wishSchema.parse({
        title: "A book",
        externalUrl: " https://EXAMPLE.com/book?q=one#details ",
      }).externalUrl,
    ).toBe("https://example.com/book?q=one#details");
    expect(
      wishSchema.parse({ title: "A book", externalUrl: "http://example.com" })
        .externalUrl,
    ).toBe("http://example.com/");
  });

  it("enforces text and priority bounds", () => {
    for (const input of [
      { title: " " },
      { title: "a".repeat(201) },
      { description: "a".repeat(4001) },
      { priority: "0" },
      { priority: "6" },
      { priority: "1.5" },
    ]) {
      expect(wishSchema.safeParse({ title: "A book", ...input }).success).toBe(
        false,
      );
    }

    expect(wishSchema.parse({ title: "A book", priority: "5" }).priority).toBe(
      5,
    );
  });
});
