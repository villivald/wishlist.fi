import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-session-feedback";
async function signIn(page: Page, owner = false) {
  const account = owner ? accounts.owner : accounts.member;
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
}

test.beforeEach(async () => {
  await resetFixtures();
  const db = testPrisma();
  try {
    await db.wishlist.create({
      data: {
        id: listId,
        title: "Shared birthday wishes",
        ownerId: "e2e-owner",
        memberships: {
          create: [
            { userId: "e2e-owner", role: "ADMIN" },
            { userId: "e2e-member", role: "MEMBER" },
          ],
        },
        wishes: {
          create: [
            {
              id: "e2e-session-reserved",
              title: "Reserved notebook",
              reservations: { create: { userId: "e2e-member" } },
            },
            { id: "e2e-session-available", title: "Available book" },
          ],
        },
      },
    });
    await db.favoriteList.create({
      data: { userId: "e2e-member", wishlistId: listId },
    });
    await db.favoriteWish.create({
      data: { userId: "e2e-member", wishId: "e2e-session-reserved" },
    });
    await db.favoritePerson.create({
      data: { userId: "e2e-member", personId: "e2e-owner" },
    });
  } finally {
    await db.$disconnect();
  }
});

test("shared toggle combines cards, preserves pagination state and redirects old links", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("heading", { name: "Shared birthday wishes" }),
  ).toHaveCount(0);
  const toggle = page.getByRole("switch", {
    name: "Include lists I’ve been given access to",
  });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "Shared birthday wishes" }),
  ).toBeVisible();
  await expect(toggle).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Another person's private list" }),
  ).toBeVisible();
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Shared birthday wishes" }),
  });
  await expect(
    card.getByText("1 available wish", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("1 reserved", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Leave list", exact: true }),
  ).toBeVisible();
  await toggle.uncheck();
  await expect(
    page.getByRole("heading", { name: "Shared birthday wishes" }),
  ).toHaveCount(0);
  await page.goto("/en/lists/shared?utm_source=qa#shared-lists");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/en/lists" && url.searchParams.get("shared") === "1",
  );
  expect(new URL(page.url()).searchParams.get("utm_source")).toBe("qa");
  expect(new URL(page.url()).hash).toBe("#shared-lists");
  await expect(toggle).toBeChecked();
  await page
    .getByRole("heading", { name: "Shared birthday wishes" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/from=lists/);
  await page
    .getByRole("link", { name: "Back to my lists", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists\?shared=1/);
  await expect(toggle).toBeChecked();
});

test("reserver sees their marked wish and reserved-only filtering updates immediately", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto(`/en/lists/${listId}`);
  const main = page.getByRole("main");
  await expect(main.getByText("@e2e-owner", { exact: true })).toBeVisible();
  await expect(
    main.getByText("Reserved by you", { exact: true }),
  ).toBeVisible();
  await expect(main.locator('[data-reserved="true"]')).toHaveCount(1);
  await page.getByRole("switch", { name: "Only reserved wishes" }).check();
  await expect(
    page.getByRole("heading", { name: "Available book" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Reserved notebook" }),
  ).toBeVisible();
  const visitor = await browser.newPage();
  try {
    await visitor.goto(page.url());
    await expect(
      visitor.getByRole("heading", { name: "Reserved notebook" }),
    ).toHaveCount(0);
    await expect(
      visitor.getByRole("heading", { name: "No reserved wishes" }),
    ).toBeVisible();
  } finally {
    await visitor.close();
  }
});

for (const locale of ["en", "fi"]) {
  test(`${locale} favorites counts, reserved cards and billing separators fit narrow themes and enlarged text`, async ({
    page,
  }, info) => {
    await signIn(page);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 320, height: 760 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(`/${locale}/favorites?view=wishes`);
      const nav = page.getByRole("navigation", {
        name: locale === "en" ? "Favorite categories" : "Suosikkien luokat",
      });
      await expect(nav.getByRole("link")).toHaveCount(3);
      for (const link of await nav.getByRole("link").all())
        await expect(link).toHaveText(/1$/);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`reserved-${locale}-${colorScheme}.png`),
        fullPage: true,
      });
    }
    await page.goto(`/${locale}/account/plan`);
    const topics = page.locator(
      'section[aria-labelledby="billing-help-heading"] details',
    );
    await expect(topics).toHaveCount(2);
    expect(
      await topics
        .nth(1)
        .evaluate((element) => getComputedStyle(element).borderTopWidth),
    ).toBe("0px");
  });
}

for (const locale of ["en", "fi"]) {
  test(`${locale}: shared cards stay compact beside owned cards and use a leave dialog`, async ({
    page,
  }, info) => {
    const db = testPrisma();
    try {
      await db.membership.update({
        where: {
          wishlistId_userId: { wishlistId: listId, userId: "e2e-member" },
        },
        data: { role: "ADMIN" },
      });
      await db.wishlist.update({
        where: { id: "e2e-private-list" },
        data: { title: "My birthday wishes", visibility: "PUBLIC" },
      });
      await db.wishlist.update({
        where: { id: listId },
        data: { theme: "botanical" },
      });
    } finally {
      await db.$disconnect();
    }
    await signIn(page);
    const labels =
      locale === "fi"
        ? {
            leave: "Poistu listalta",
            dialog: "Poistutaanko listalta?",
            cancel: "Peruuta",
            role: "Ylläpitäjä",
          }
        : {
            leave: "Leave list",
            dialog: "Leave this list?",
            cancel: "Cancel",
            role: "Admin",
          };
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`/${locale}/lists`);
      const shared = page.getByRole("listitem").filter({
        has: page.getByRole("heading", {
          name: "Shared birthday wishes",
          exact: true,
        }),
      });
      const own = page.getByRole("listitem").filter({
        has: page.getByRole("heading", {
          name: "My birthday wishes",
          exact: true,
        }),
      });
      await expect(own).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const ownHeight = (await own.boundingBox())!.height;
      const toggle = page.getByRole("switch", {
        name:
          locale === "fi"
            ? "Näytä myös listat, joihin olen saanut käyttöoikeuden"
            : "Include lists I’ve been given access to",
      });
      await toggle.check();
      await expect(shared).toBeVisible();
      expect(
        (await shared.locator('[class*="meta"]').boundingBox())!.height,
      ).toBeLessThan(30);
      expect(
        Math.abs((await own.boundingBox())!.height - ownHeight),
        "Adding a themed shared card must not stretch the existing card",
      ).toBeLessThan(1);
      await expect(
        shared.getByText(labels.role, { exact: true }),
      ).toBeVisible();
      await expect(shared.getByRole("checkbox")).toHaveCount(0);
      await expect(
        own.getByRole("button", { name: labels.leave, exact: true }),
      ).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const sharedFooter = await shared
        .locator('[class*="list-footer"]')
        .boundingBox();
      const ownFooter = await own
        .locator('[class*="list-footer"]')
        .boundingBox();
      expect(Math.abs(sharedFooter!.y - ownFooter!.y)).toBeLessThanOrEqual(1);
      const cardHeight = (await shared.boundingBox())!.height;
      await page.locator('main [class*="list-grid"]').screenshot({
        path: info.outputPath(`shared-cards-${locale}-${theme}.png`),
      });
      const trigger = shared.getByRole("button", {
        name: labels.leave,
        exact: true,
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: labels.dialog,
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: labels.cancel, exact: true }),
      ).toBeFocused();
      await expect(
        dialog.getByRole("button", { name: labels.leave, exact: true }),
      ).toBeDisabled();
      await dialog.screenshot({
        path: info.outputPath(`leave-dialog-${locale}-${theme}.png`),
      });
      expect(
        Math.abs((await shared.boundingBox())!.height - cardHeight),
      ).toBeLessThan(1);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.setViewportSize({ width: 320, height: 760 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await trigger.click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("checkbox").check();
      await expect(
        dialog.getByRole("button", { name: labels.leave, exact: true }),
      ).toBeEnabled();
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      const warning = await dialog.locator("label span").boundingBox();
      expect(warning!.width).toBeGreaterThan(180);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await dialog.screenshot({
        path: info.outputPath(`leave-dialog-${locale}-${theme}-large.png`),
      });
      await dialog
        .getByRole("button", { name: labels.cancel, exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();
      await page.keyboard.press("Escape");
    }
  });
}

test("leaving a private shared list confirms first and ends access-dependent reservations", async ({
  page,
}) => {
  const db = testPrisma();
  try {
    await db.wishlist.update({
      where: { id: listId },
      data: { visibility: "PRIVATE" },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page);
  await page.goto("/en/lists?shared=1");
  const shared = page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: "Shared birthday wishes",
      exact: true,
    }),
  });
  await shared.getByRole("button", { name: "Leave list", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Leave this list?",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Leave list", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Leave list", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(shared).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Another person's private list",
      exact: true,
    }),
  ).toBeVisible();
  const result = testPrisma();
  try {
    expect(
      await result.membership.count({
        where: { wishlistId: listId, userId: "e2e-member" },
      }),
    ).toBe(0);
    expect(
      await result.reservation.count({
        where: { wishId: "e2e-session-reserved", endedAt: null },
      }),
    ).toBe(0);
    expect(
      await result.wishlist.count({
        where: { id: listId, ownerId: "e2e-owner" },
      }),
    ).toBe(1);
  } finally {
    await result.$disconnect();
  }
});

test("hidden membership cards allow leaving without disclosing hidden contents", async ({
  page,
}) => {
  const db = testPrisma();
  try {
    await db.wishlist.update({
      where: { id: listId },
      data: { publication: "DRAFT" },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page);
  await page.goto("/en/lists?shared=1");
  expect(
    await (await page.request.get("/en/lists?shared=1")).text(),
  ).not.toContain("Shared birthday wishes");
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "Hidden list", exact: true }),
  });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link")).toHaveCount(0);
  await card.getByRole("button", { name: "Leave list", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Leave this list?",
    exact: true,
  });
  await expect(dialog.getByText("Hidden list", { exact: true })).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Leave list", exact: true }).click();
  await expect(card).toHaveCount(0);
});

test("a stale leave dialog shows an accessible error without removing the list", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/en/lists?shared=1");
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: "Shared birthday wishes",
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "Leave list", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Leave this list?",
    exact: true,
  });
  const db = testPrisma();
  try {
    await db.membership.deleteMany({
      where: { wishlistId: listId, userId: "e2e-member" },
    });
  } finally {
    await db.$disconnect();
  }
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Leave list", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "This membership is unavailable.",
  );
  await expect(dialog.getByRole("alert")).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: reserved styling fits ordinary cards and reservations avoid duplicate emphasis and dividers`, async ({
    page,
  }, info) => {
    await signIn(page);
    for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`/${locale}/lists/${listId}`);
      const reserved = page.locator('[data-reserved="true"]');
      await expect(reserved).toHaveCount(1);
      await expect(
        reserved.getByText(
          locale === "en" ? "Reserved by you" : "Sinun varaamasi",
          {
            exact: true,
          },
        ),
      ).toBeVisible();
      await page.locator('main [class*="list-grid"]').screenshot({
        path: info.outputPath(`wish-cards-${locale}-${theme}.png`),
      });
      await page.goto(`/${locale}/reservations`);
      await expect(
        page.getByRole("heading", { name: "Reserved notebook", exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-reserved="true"]')).toHaveCount(0);
      const invitations = page.locator(
        'section[aria-labelledby="group-invitations-heading"]',
      );
      await expect(invitations).toBeVisible();
      expect(
        await invitations.evaluate(
          (element) => getComputedStyle(element).borderTopWidth,
        ),
      ).toBe("0px");
      await page.getByRole("main").screenshot({
        path: info.outputPath(`reservations-${locale}-${theme}.png`),
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
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
  });
}
