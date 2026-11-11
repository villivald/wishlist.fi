import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toActionState } from "@/components/form/utils/to-action-state";
import { safeReturnTo } from "@/features/auth/utils/return-to";
import { formatWishPrice } from "@/features/wish/utils/money";
import { clientTextKeys } from "@/i18n/client-keys";
import { localizedPath, withoutLocale } from "@/i18n/config";
import english from "@/i18n/messages/en.json";
import finnish from "@/i18n/messages/fi.json";
import { clientCatalog, createText } from "@/i18n/text";
import { createTranslator } from "@/i18n/translator";
import {
  localizationReferences,
  runtimeFeedbackStrings,
  runtimeStrings,
} from "../scripts/localization-source";

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("English and Finnish catalogs", () => {
  it("uses runtime references rather than comments or types", () => {
    const source = ts.createSourceFile(
      "example.ts",
      '// t("Dead comment")\ntype Label = "Dead type";\nconst title = t(\'Live message\');\nconst fallback = `Live template`;\n',
      ts.ScriptTarget.Latest,
      true,
    );
    expect([...runtimeStrings(source)].sort()).toEqual([
      "Live message",
      "Live template",
    ]);
  });
  it("finds feedback returned through actions, API replies, and application errors", () => {
    const source = ts.createSourceFile(
      "feedback.ts",
      `const legal = "Server-only legal copy";
       toActionState("SUCCESS", "Action feedback");
       toActionState("PENDING", pending ? "Waiting" : "Ready");
       reply("Image feedback", 200);
       throw new WishlistError("Access feedback");`,
      ts.ScriptTarget.Latest,
      true,
    );
    expect([...runtimeFeedbackStrings(source)].sort()).toEqual([
      "Access feedback",
      "Action feedback",
      "Image feedback",
      "Ready",
      "Waiting",
    ]);
  });
  it("keeps server feedback localized in the reduced client catalog", () => {
    const enClient = createTranslator("en", clientCatalog("en"));
    const fiClient = createTranslator("fi", clientCatalog("fi"));
    for (const key of [
      "Billing details are up to date.",
      "Paddle is temporarily unavailable. Your last confirmed billing details are shown. Try refreshing billing shortly.",
      "Image saved.",
      "Image removed.",
      "List is now visible.",
      "Changes saved.",
      "This favorite is no longer available. Choose another person or enter an email address.",
    ] as const) {
      expect(clientTextKeys).toContain(key);
      expect(enClient.message(key)).toBe(createText("en")(key));
      expect(fiClient.message(key)).toBe(createText("fi")(key));
    }
  });
  it("keeps server-only legal and email copy out of client dictionaries", () => {
    expect(clientTextKeys).not.toContain(
      "Hi {name}, thank you for choosing Wishlist Premium.",
    );
    expect(clientTextKeys).not.toContain(
      "Account data is kept while your account exists. Shared content and reservation history can remain with a list after an account is deleted. The app does not automatically purge archived lists or all historical records after a fixed period.",
    );
    expect(clientTextKeys).toContain("No price added");
    expect(clientTextKeys).toContain("Incorrect email or password");
  });
  it("keeps all keys and interpolation parameters aligned and free of unused entries", () => {
    expect(Object.keys(finnish).sort()).toEqual(Object.keys(english).sort());
    const references = localizationReferences(Object.keys(english));
    expect(references.unreferencedKeys).toEqual([]);
    expect(references.clientCatalogLeaks).toEqual([]);
    expect(clientTextKeys).toEqual(references.clientKeys);
    const enClient = createTranslator("en", clientCatalog("en"));
    const fiClient = createTranslator("fi", clientCatalog("fi"));
    const enServer = createText("en");
    const fiServer = createText("fi");
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(finnish[key].trim(), key).not.toBe("");
      expect(placeholders(finnish[key]), key).toEqual(
        placeholders(english[key]),
      );
      if (key !== "{value0}…") expect(finnish[key], key).not.toBe(english[key]);
      if ((clientTextKeys as readonly string[]).includes(key)) {
        expect(enClient(key), key).toBe(enServer(key));
        expect(fiClient(key), key).toBe(fiServer(key));
      }
    }
  });
  it("renders Finnish plurals, prices, and safe message codes", () => {
    const t = createText("fi");
    expect(t.plural("{count} public list", "{count} public lists", 1)).toBe(
      "1 julkinen lista",
    );
    expect(t.plural("{count} public list", "{count} public lists", 0)).toBe(
      "0 julkista listaa",
    );
    expect(t.plural("{count} public list", "{count} public lists", 2)).toBe(
      "2 julkista listaa",
    );
    expect(formatWishPrice(1250, "EUR", t)).toMatch(/12,50\s+EUR/);
    expect(formatWishPrice(null, null, t)).toBe("Hintaa ei ole lisätty");
    const state = toActionState("ERROR", "Incorrect email or password");
    expect(state.messageCode).toBeDefined();
    expect(t.feedback({ ...state, message: "presentation text changed" })).toBe(
      "Sähköposti tai salasana on väärä",
    );
    expect(t("View {value0}", { value0: "Private wish" })).toBe(
      "Avaa: Private wish",
    );
  });
});

describe("locale routing security", () => {
  it("preserves queries and fragments without stacking prefixes", () => {
    expect(
      localizedPath("/en/browse?view=wishes&page=2#main-content", "fi"),
    ).toBe("/fi/browse?view=wishes&page=2#main-content");
    expect(localizedPath("/guest#secret", "fi")).toBe("/fi/guest#secret");
    expect(localizedPath("/api/guest", "fi")).toBe("/api/guest");
    expect(withoutLocale("/fi")).toBe("/");
  });
  it("allows both localized and legacy viewing destinations and rejects unsafe ones", () => {
    for (const path of [
      "/en/lists/list-1/wishes/wish-1",
      "/fi/invitations/invite-1",
      "/lists/list-1",
      "/fi/reservations/group-1",
    ])
      expect(safeReturnTo(path)).toBe(path);
    for (const path of [
      "//example.com",
      "/fi//example.com",
      "/fi/\\example.com",
      "/fi/en/lists",
      "/fi/lists?next=evil",
      "/fi/lists/%2f",
      "/sv/lists",
      "/fi/api/guest",
    ])
      expect(safeReturnTo(path)).toBe("/lists");
  });
});
