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
