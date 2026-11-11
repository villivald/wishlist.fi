import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { openMainNavigation } from "./navigation";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-favorites-list";
const wishId = "e2e-favorites-wish";
const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.member.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.member.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};
const favoritesLink = (page: Page, locale = "en") =>
  page
    .getByRole("navigation", {
      name: locale === "fi" ? "Päänavigaatio" : "Main navigation",
      includeHidden: true,
    })
    .getByRole("link", {
      name: locale === "fi" ? "Suosikit" : "Favorites",
      exact: true,
      includeHidden: true,
    });

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { name: "Favorite person" },
    });
    await prisma.wishlist.create({
      data: {
        id: listId,
        title: "Favorite gift list",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: wishId,
            title: "Favorite notebook",
            authorId: "e2e-owner",
            priceMinor: 1999,
            currency: "EUR",
            priority: 4,
            externalUrl: "https://example.com/notebook",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("one-click favorites persist across lists, wishes, people, and detail navigation", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.goto("/en/browse");
  await page
    .getByRole("button", {
      name: "Add Favorite gift list to favorites",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite gift list from favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/en/browse?view=wishes");
  await page
    .getByRole("button", {
      name: "Add Favorite notebook to favorites",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite notebook from favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/en/browse?view=users");
  await page
    .getByRole("button", {
      name: "Add Favorite person to favorites",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite person from favorites",
      exact: true,
    }),
  ).toBeVisible();
  await openMainNavigation(page);
  await favoritesLink(page).click();
  await expect(
    page.getByRole("heading", { name: "Favorite gift list", exact: true }),
  ).toBeVisible();
  const listCard = page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: "Favorite gift list",
      exact: true,
    }),
  });
  await expect(
    listCard.getByText("1 available wish", { exact: true }),
  ).toBeVisible();
  await expect(
    listCard.getByText("Favorite person", { exact: true }),
  ).toBeVisible();
  await expect(listCard.getByText("@e2e-owner", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    listCard.getByText("Visible · Anyone", { exact: true }),
  ).toHaveCount(0);
  await expect(
    listCard.getByRole("button", { name: "Copy link to Favorite gift list" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("favorites-en.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("link", { name: "Favorite gift list", exact: true })
    .click();
  await expect(favoritesLink(page)).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("link", { name: "Back to favorites", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Favorite categories" })
    .getByRole("link", { name: /^Wishes \d+/ })
    .click();
  await expect(page).toHaveURL(/\/favorites\?view=wishes$/);
  await expect(
    page.getByRole("heading", { name: "Favorite notebook", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("img", { name: "Priority: 4 out of 5 stars" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reserve Favorite notebook", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Product link for Favorite notebook (opens in a new tab)",
    }),
  ).toHaveAttribute("href", "https://example.com/notebook");
  await page
    .getByRole("link", { name: "Favorite notebook", exact: true })
    .click();
  await expect(favoritesLink(page)).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: info.outputPath("wish-detail-favorite-heading.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", {
      name: "Remove Favorite notebook from favorites",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Add Favorite notebook to favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.goto("/en/favorites?view=wishes");
  await expect(
    page.getByRole("heading", { name: "No favorites yet" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Favorite categories" })
    .getByRole("link", { name: /^People \d+/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Favorite person" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "View public lists", exact: true })
    .click();
  await expect(page).toHaveURL(/owner=e2e-owner/);
  expect(errors).toEqual([]);
});

test("favorites recheck reservation and visibility changes and allow removal without affecting anyone else's saved items", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/lists/${listId}/wishes/${wishId}`);
  await page
    .getByRole("button", { name: "Add Favorite notebook to favorites" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite notebook from favorites",
    }),
  ).toBeVisible();
  const prisma = testPrisma();
  try {
    await prisma.reservation.create({ data: { userId: "e2e-owner", wishId } });
    await page.goto("/en/favorites?view=wishes");
    await expect(
      page.getByRole("heading", { name: "No favorites yet" }),
    ).toBeVisible();
    expect(await page.getByRole("main").textContent()).not.toContain(
      "Favorite notebook",
    );
    await prisma.reservation.updateMany({
      where: { wishId },
      data: { endedAt: new Date() },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Favorite notebook" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Remove Favorite notebook from favorites" })
      .click();
    await expect(
      page.getByRole("heading", { name: "No favorites yet" }),
    ).toBeVisible();
    expect(
      await prisma.favoriteWish.count({ where: { userId: "e2e-member" } }),
    ).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("a stale save reports an accessible error and never bookmarks newly private content", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/lists/${listId}`);
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PRIVATE" },
    });
    await page
      .getByRole("button", { name: "Add Favorite gift list to favorites" })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "This item is unavailable or you no longer have access.",
    );
    expect(await prisma.favoriteList.count()).toBe(0);
    await page.goto("/en/favorites");
    await expect(
      page.getByRole("heading", { name: "No favorites yet" }),
    ).toBeVisible();
  } finally {
    await prisma.$disconnect();
  }
});

test("same-title lists show owner names with username fallback in private favorites", async ({
  page,
}, info) => {
  const prisma = testPrisma();
  try {
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { name: "Alex" },
    });
    await prisma.user.update({
      where: { id: "e2e-member" },
      data: { name: "Taylor" },
    });
    await prisma.wishlist.update({
      where: { id: listId },
      data: { title: "Joulu" },
    });
    await prisma.wishlist.create({
      data: {
        id: "e2e-same-title-list",
        title: "Joulu",
        ownerId: "e2e-member",
        publication: "PUBLISHED",
        memberships: { create: { userId: "e2e-member", role: "ADMIN" } },
      },
    });
    await signIn(page);
    for (const locale of ["en", "fi"]) {
      await page.goto(`/${locale}/browse?q=Joulu`);
      const cards = page.getByRole("listitem").filter({
        has: page.getByRole("heading", { name: "Joulu", exact: true }),
      });
      await expect(cards).toHaveCount(2);
      for (const [name, username] of [
        ["Alex", "e2e-owner"],
        ["Taylor", "e2e-member"],
      ]) {
        const card = cards.filter({ hasText: name });
        await expect(card).toHaveCount(1);
        await expect(card.getByText(name, { exact: true })).toHaveAttribute(
          "title",
          `@${username}`,
        );
        await expect(
          card.getByText(`@${username}`, { exact: true }),
        ).toHaveCount(0);
      }
      await page.screenshot({
        path: info.outputPath(`same-title-owners-${locale}.png`),
        fullPage: true,
        scale: "css",
      });
      if (locale === "en") {
        await cards
          .filter({ hasText: "Alex" })
          .getByRole("button", { name: "Add Joulu to favorites", exact: true })
          .click();
        await expect(
          cards.getByRole("button", { name: "Remove Joulu from favorites" }),
        ).toBeVisible();
      }
    }
    await prisma.wishlist.update({
      where: { id: listId },
      data: {
        visibility: "PRIVATE",
        memberships: { create: { userId: "e2e-member", role: "MEMBER" } },
      },
    });
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { name: null },
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.goto("/fi/favorites");
    await expect(page.getByRole("heading", { name: "Joulu" })).toBeVisible();
    await expect(page.getByText("@e2e-owner", { exact: true })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(
      accounts.owner.email,
    );
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("private-owner-fallback-fi-320.png"),
      fullPage: true,
      scale: "css",
    });
    await prisma.membership.deleteMany({
      where: { wishlistId: listId, userId: "e2e-member" },
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Joulu" })).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText("@e2e-owner");
  } finally {
    await prisma.$disconnect();
  }
});

test("Finnish favorites support keyboard use, dark mode, enlarged text, and narrow layouts", async ({
  page,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/fi/browse?view=wishes");
  const button = page.getByRole("button", {
    name: "Lisää Favorite notebook suosikkeihin",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Poista Favorite notebook suosikeista",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await openMainNavigation(page, "fi");
  await favoritesLink(page, "fi").click();
  await page
    .getByRole("navigation", { name: "Suosikkien luokat" })
    .getByRole("link", { name: /^Toiveet \d+/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Favorite notebook" }),
  ).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("favorites-fi-narrow.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", {
      name: "Poista Favorite notebook suosikeista",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ei vielä suosikkeja" }),
  ).toBeVisible();
});

test("signed-out visitors cannot access saved items or see favorite controls", async ({
  page,
}) => {
  await page.goto("/en/browse");
  await expect(page.getByRole("button", { name: /to favorites/ })).toHaveCount(
    0,
  );
  await page.goto("/en/favorites");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("reserving and canceling preserves the saved wish and keeps reservation cards focused", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/lists/${listId}/wishes/${wishId}`);
  await page
    .getByRole("button", {
      name: "Add Favorite notebook to favorites",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite notebook from favorites",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/en/favorites?view=wishes");
  await page
    .getByRole("link", { name: "Reserve Favorite notebook", exact: true })
    .click();
  await page.getByRole("button", { name: "Reserve wish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel reservation", exact: true }),
  ).toBeVisible();
  await page.goto("/en/favorites?view=wishes");
  await expect(
    page.getByText("Reserved by you", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite notebook from favorites",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reserve Favorite notebook", exact: true }),
  ).toHaveCount(0);
  await page.goto("/en/reservations");
  await expect(
    page.getByRole("img", { name: "Priority: 4 out of 5 stars" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: /favorites/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No active reservations" }),
  ).toBeVisible();
  await page.goto("/en/favorites?view=wishes");
  await expect(
    page.getByRole("button", {
      name: "Remove Favorite notebook from favorites",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Reserve Favorite notebook", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Reserved by you", { exact: true })).toHaveCount(
    0,
  );
});

test("mobile shortcuts keep destinations visible and adapt labels without crowding the full menu", async ({
  page,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 414, height: 896 });
  const quick = page.getByRole("navigation", { name: "Quick navigation" });
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  await expect(quick.getByRole("link")).toHaveCount(4);
  await expect(page.locator('[data-labels-fit="true"]')).toBeVisible();
  for (const label of await quick.locator("[data-shortcut-label]").all())
    await expect(label).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await quick.getByRole("link", { name: "Favorites", exact: true }).click();
  await expect(page).toHaveURL(/favorites$/);
  await expect(
    quick.getByRole("link", { name: "Favorites", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.screenshot({
    path: info.outputPath("mobile-shortcuts-en.png"),
    scale: "css",
  });

  await toggle.focus();
  await page.keyboard.press("Enter");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("link")).toHaveCount(5);
  for (const link of await nav.getByRole("link").all())
    await expect(link).toBeVisible();
  await page.screenshot({
    path: info.outputPath("mobile-menu-en.png"),
    scale: "css",
  });
  await nav.getByRole("link", { name: "Account", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "My reservations", exact: true })
    .click();
  await expect(page).toHaveURL(/reservations$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    quick.getByRole("link", { name: "My reservations", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "Account", exact: true })
    .click();
  await expect(page).toHaveURL(/account\/profile$/);
  await expect(toggle).toHaveAttribute("data-current", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(quick.locator('[aria-current="page"]')).toHaveCount(0);
  await quick.getByRole("link", { name: "Favorites", exact: true }).click();
  await expect(page).toHaveURL(/favorites$/);
  await expect(toggle).not.toHaveAttribute("data-current", "true");

  for (const locale of ["en", "fi"]) {
    await page.goto(`/${locale}/favorites`);
    await page.setViewportSize({ width: 375, height: 812 });
    const shortcuts = page.getByRole("navigation", {
      name: locale === "fi" ? "Pikanavigaatio" : "Quick navigation",
    });
    await page.evaluate(() => document.fonts.ready);
    // Every visible caption fits its own target, independent of the locale.
    await expect
      .poll(() =>
        shortcuts
          .locator('[data-visible="true"]')
          .evaluateAll((labels) =>
            labels.every(
              (label) =>
                label.getBoundingClientRect().width <=
                label.closest("a")!.clientWidth,
            ),
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`mobile-shortcuts-${locale}-375.png`),
      scale: "css",
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect(page.locator('[data-labels-fit="false"]')).toBeVisible();
    for (const link of await shortcuts.getByRole("link").all()) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await expect(link).toHaveAccessibleName(/\S/);
    }
    for (const caption of await shortcuts
      .locator("[data-shortcut-label]")
      .all())
      await expect(caption).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`mobile-shortcuts-${locale}-large.png`),
      fullPage: true,
      scale: "css",
    });
    await openMainNavigation(page, locale);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`mobile-menu-${locale}-large.png`),
      scale: "css",
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page.getByRole("button", { name: "Valikko", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Pikanavigaatio" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Päänavigaatio" }),
  ).toBeVisible();
});
