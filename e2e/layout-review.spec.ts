import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, test } from "@playwright/test";
import sharp from "sharp";
import { expectImageLoaded } from "./image-assertions";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-layout-review";

test.beforeEach(async () => {
  await resetFixtures();
  const db = testPrisma();
  try {
    await db.premiumGrant.create({
      data: {
        userId: "e2e-owner",
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.wishlist.create({
      data: {
        id: listId,
        title: "Birthday wishes",
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

async function expectAligned(first: Locator, second: Locator) {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const left = await first.boundingBox();
  const right = await second.boundingBox();
  expect(left).not.toBeNull();
  expect(right).not.toBeNull();
  expect(Math.abs(left!.y - right!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(left!.height - right!.height)).toBeLessThanOrEqual(1);
}

for (const locale of ["en", "fi"]) {
  test(`${locale}: audience, plan and profile panels align and adapt to enlarged text`, async ({
    page,
  }, info) => {
    await page.goto("/en/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(accounts.owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/lists$/);
    await page.goto("/en/account/profile");
    const avatar = await sharp({
      create: { width: 112, height: 112, channels: 3, background: "#80a39b" },
    })
      .png()
      .toBuffer();
    await page.locator('input[type="file"]').setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: avatar,
    });
    await page
      .getByLabel("Image description", { exact: true })
      .fill("Layout review avatar");
    await page
      .getByRole("button", { name: "Upload image", exact: true })
      .click();
    await expectImageLoaded(
      page.getByRole("main").getByRole("img", { name: "Layout review avatar" }),
    );
    const routes = [
      {
        name: "sharing",
        path: `/lists/${listId}/sharing`,
        selector: 'fieldset[class*="audience"]',
      },
      {
        name: "plan",
        path: "/account/plan",
        selector:
          '[class*="help"]:has(> section[aria-labelledby="promo-heading"])',
      },
      {
        name: "profile",
        path: "/account/profile",
        selector: '[class*="account-columns"]',
      },
    ];
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      for (const route of routes) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`/${locale}${route.path}`);
        await expect(page.locator("[data-loading-preview]")).not.toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const panels = page.locator(route.selector).filter({ visible: true });
        const first = panels
          .locator(
            route.name === "sharing"
              ? ":scope > label"
              : ":scope > :first-child",
          )
          .first();
        const second =
          route.name === "sharing"
            ? panels.locator(":scope > label").nth(1)
            : panels.locator(":scope > :nth-child(2)");
        await expectAligned(first, second);
        if (route.name === "profile") {
          const profile = await first.boundingBox();
          const avatar = await second
            .locator(":scope > :last-child")
            .boundingBox();
          expect(
            Math.abs(profile!.y + profile!.height - avatar!.y - avatar!.height),
          ).toBeLessThanOrEqual(1);
          const security = await panels
            .locator(":scope > :last-child")
            .boundingBox();
          const bounds = await panels.boundingBox();
          expect(security!.width).toBeCloseTo(bounds!.width, 0);
          expect(security!.y).toBeGreaterThan(profile!.y + profile!.height);
        }
        await panels.screenshot({
          path: info.outputPath(`${route.name}-${locale}-${theme}-desktop.png`),
        });
        await page.setViewportSize({ width: 320, height: 760 });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const top = await first.boundingBox();
        const next = await second.boundingBox();
        expect(next!.y).toBeGreaterThanOrEqual(top!.y + top!.height);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
    }
  });
}

test("wish card facts, badges and actions align across mixed content", async ({
  page,
}) => {
  const db = testPrisma();
  try {
    await db.wish.createMany({
      data: [
        {
          id: "e2e-card-zero",
          title: "A",
          priceMinor: 0,
          currency: "EUR" as const,
          priority: 3,
        },
        {
          title: "B – The Making of the Middle Ages by John Haywood",
          priority: 5,
        },
        {
          title: "C",
          priceMinor: 2_147_483_647,
          currency: "GBP" as const,
          priority: 1,
          hidden: true,
        },
        { title: "D" },
      ].map((wish) => ({
        ...wish,
        wishlistId: listId,
        authorId: "e2e-owner",
      })),
    });
    await db.reservation.create({
      data: { wishId: "e2e-card-zero", userId: "e2e-member" },
    });
  } finally {
    await db.$disconnect();
  }

  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);

  for (const locale of ["fi", "en"]) {
    await page.emulateMedia({
      colorScheme: locale === "fi" ? "dark" : "light",
    });
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto(`/${locale}/lists/${listId}?sort=title`);
    const cards = page.locator("li[data-wish-tone]");
    await expect(cards).toHaveCount(4);
    await page.evaluate(() => document.fonts.ready);
    const first = cards.nth(0);
    const second = cards.nth(1);
    const third = cards.nth(2);
    await expect(first.locator("[data-missing=false]")).toContainText("0");
    await expect(second.locator("[data-missing=true]")).toHaveText(
      locale === "fi" ? "Hintaa ei ole lisätty" : "No price added",
    );
    await expect(cards.nth(3).locator("[role=img]")).toHaveCount(0);
    await expect(
      first.getByText(locale === "fi" ? "Varattu" : "Reserved", {
        exact: true,
      }),
    ).toBeVisible();

    for (const selector of [
      "[data-missing]",
      '[class*="states"]',
      '[class*="actions"]',
    ]) {
      const top = (card: Locator) =>
        card
          .locator(selector)
          .first()
          .evaluate((el) => el.getBoundingClientRect().top);
      expect(
        Math.abs((await top(first)) - (await top(second))),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs((await top(first)) - (await top(third))),
      ).toBeLessThanOrEqual(1);
    }
    await expectAligned(
      first.locator("[role=img]"),
      second.locator("[role=img]"),
    );
    await cards
      .first()
      .locator("..")
      .screenshot({ path: test.info().outputPath(`wish-cards-${locale}.png`) });
    const fourthTop = await cards
      .nth(3)
      .evaluate((el) => el.getBoundingClientRect().top);
    const firstBottom = await first.evaluate(
      (el) => el.getBoundingClientRect().bottom,
    );
    expect(fourthTop - firstBottom).toBeCloseTo(40, 0);

    await page.setViewportSize({ width: 650, height: 850 });
    await expectAligned(
      first.locator("[role=img]"),
      second.locator("[role=img]"),
    );
    const narrowPrice = await first.locator("[data-missing]").boundingBox();
    const narrowPriority = await first.locator("[role=img]").boundingBox();
    expect(narrowPriority!.y).toBeGreaterThanOrEqual(
      narrowPrice!.y + narrowPrice!.height,
    );

    await page.setViewportSize({ width: 320, height: 760 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(page.locator("html")).toHaveJSProperty(
      "scrollWidth",
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    const price = await first.locator("[data-missing]").boundingBox();
    const stars = await first.locator("[role=img]").boundingBox();
    expect(stars!.y).toBeGreaterThanOrEqual(price!.y + price!.height);
    expect(
      await cards.evaluateAll((items) =>
        items.every((item) => item.scrollWidth <= item.clientWidth + 1),
      ),
    ).toBe(true);
  }
});
