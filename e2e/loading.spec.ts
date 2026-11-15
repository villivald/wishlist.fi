import { expect, test } from "@playwright/test";
import { openMainNavigation } from "./navigation";
import { accounts, resetFixtures, testPrisma } from "./seed";

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: "e2e-loading-list",
        title: "Loading test list",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: { create: { id: "e2e-loading-wish", title: "A little gift" } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

for (const locale of ["en", "fi"]) {
  test(`${locale}: top-bar loading previews keep content anchors in place`, async ({
    page,
    browser,
  }) => {
    await page.goto("/en/sign-in");
    await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
    await page
      .getByLabel("Password", { exact: true })
      .fill(accounts.owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/lists$/);
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: await page.context().storageState(),
      viewport: page.viewportSize(),
    });
    const frozen = await context.newPage();
    try {
      for (const route of [
        {
          path: "browse",
          heading: locale === "fi" ? "Selaa toivelistoja" : "Browse wishlists",
          tab: locale === "fi" ? "Selaa" : "Browse",
          selectors: [
            "main h1:visible",
            '[class*="filter-panel"]:visible',
            'main [class*="list-grid"]:visible',
          ],
        },
        {
          path: "lists",
          heading: locale === "fi" ? "Omat listat" : "My lists",
          tab: locale === "fi" ? "Omat listat" : "My lists",
          selectors: ["main h1:visible", 'main [class*="list-grid"]:visible'],
        },
        {
          path: "account/profile",
          heading: locale === "fi" ? "Oma tili" : "Your account",
          tab: locale === "fi" ? "Tili" : "Account",
          selectors: [
            "main h1:visible",
            '[class*="account-details"]:visible',
            '[class*="profile-guidance"]:visible',
            "#profile-name:visible",
            "#profile-description:visible",
          ],
        },
      ]) {
        await frozen.goto(new URL(`/${locale}/${route.path}`, page.url()).href);
        await expect(
          frozen.locator("[data-loading-preview]").first(),
        ).toBeVisible();
        await frozen.evaluate(() => document.fonts.ready);
        const before = await Promise.all(
          route.selectors.map(async (selector) => {
            const anchor = frozen.locator(selector).first();
            return (await anchor.count()) ? anchor.boundingBox() : null;
          }),
        );
        await page.goto(`/${locale}/reservations`);
        await (
          await openMainNavigation(page, locale)
        )
          .getByRole("link", { name: route.tab, exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/${route.path}$`));
        await expect(
          page.getByRole("heading", { name: route.heading, exact: true }),
        ).toBeVisible();
        await expect(page.locator("[data-loading-preview]")).not.toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        const after = await Promise.all(
          route.selectors.map((selector) =>
            page.locator(selector).first().boundingBox(),
          ),
        );

        for (const [index, selector] of route.selectors.entries()) {
          expect
            .soft(before[index], `${route.path}: ${selector} loading anchor`)
            .not.toBeNull();
          expect
            .soft(after[index], `${route.path}: ${selector} loaded anchor`)
            .not.toBeNull();
          if (before[index] && after[index]) {
            for (const coordinate of ["x", "y", "width"] as const) {
              expect
                .soft(
                  Math.abs(
                    before[index]![coordinate] - after[index]![coordinate],
                  ),
                  `${route.path}: ${selector} ${coordinate}`,
                )
                .toBeLessThanOrEqual(1);
            }
          }
        }
      }
    } finally {
      await context.close();
    }
  });
}

test("My lists navigation stays direct while brand links open the homepage", async ({
  page,
}) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  const heading = page.getByRole("heading", { name: "My lists", exact: true });
  await expect(heading).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Loading test list", exact: true }),
  ).toBeVisible();
  const originalHeading = await heading.elementHandle();
  const position = await heading.boundingBox();
  const brand = page.getByRole("banner").getByRole("link", {
    name: "Wishlist",
    exact: true,
  });

  await expect(brand).toHaveAttribute("href", "/en");
  const footerBrand = page.getByRole("contentinfo").getByRole("link", {
    name: "Wishlist",
    exact: true,
  });
  await expect(footerBrand).toHaveAttribute("href", "/en");
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "My lists", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(heading).toBeVisible();
  expect(
    await originalHeading!.evaluate((element) => element.isConnected),
  ).toBe(true);
  expect(await heading.boundingBox()).toEqual(position);
  await expect(page.locator("[data-loading-preview]")).not.toBeVisible();

  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "Browse", exact: true })
    .click();
  await expect(page).toHaveURL(/\/browse$/);
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "My lists", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(heading).toBeVisible();

  await brand.click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(
    page.getByRole("heading", { name: "A little space for your wishes." }),
  ).toBeVisible();

  await page.goto("/en/browse");
  await footerBrand.click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(
    page.getByRole("heading", { name: "A little space for your wishes." }),
  ).toBeVisible();
});

for (const locale of ["en", "fi"]) {
  for (const count of [0, 1, 4]) {
    test(`${locale}: reservations with ${count} wishes replace Browse and My lists only when ready`, async ({
      page,
    }, info) => {
      if (count) {
        const prisma = testPrisma();
        try {
          await prisma.wish.createMany({
            data: Array.from({ length: count }, (_unused, index) => ({
              id: `e2e-reserved-${index}`,
              wishlistId: "e2e-loading-list",
              title:
                index === 0
                  ? "A little gift"
                  : "A thoughtful gift with a longer title that wraps across several lines",
            })),
          });
          await prisma.reservation.createMany({
            data: Array.from({ length: count }, (_unused, index) => ({
              userId: "e2e-owner",
              wishId: `e2e-reserved-${index}`,
            })),
          });
        } finally {
          await prisma.$disconnect();
        }
      }
      await page.goto("/en/sign-in");
      await page
        .getByLabel("Email", { exact: true })
        .fill(accounts.owner.email);
      await page
        .getByLabel("Password", { exact: true })
        .fill(accounts.owner.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/lists$/);
      const heading = locale === "fi" ? "Omat varaukset" : "My reservations";
      const target = `/${locale}/reservations`;

      for (const source of ["browse", "lists"]) {
        await page.goto(`/${locale}/${source}`);
        await expect(page.locator("[data-loading-preview]")).not.toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await openMainNavigation(page, locale);
        const sourceHeading = page
          .getByRole("main")
          .getByRole("heading", { level: 1 });
        const originalHeading = await sourceHeading.elementHandle();
        const sourceBounds = await page.getByRole("main").boundingBox();
        const footerBounds = await page.getByRole("contentinfo").boundingBox();
        const navigation = page.getByRole("navigation", {
          name: locale === "fi" ? "Päänavigaatio" : "Main navigation",
          includeHidden: true,
        });
        const link = navigation.getByRole("link", {
          name: heading,
          exact: true,
          includeHidden: true,
        });
        const linkBounds = await link.boundingBox();
        // Hold the route response to inspect a real pending navigation, without timers.
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const pattern = `**${target}?*`;
        await page.route(pattern, async (route) => {
          const response = await route.fetch();
          await held;
          await route.fulfill({ response });
        });
        try {
          await page.evaluate((targetHeading) => {
            const samples: {
              headingY: number;
              helpY: number;
              footerY: number;
            }[] = [];
            const state = { samples, running: true };
            Object.assign(window, { reservationNavigation: state });
            const sample = () => {
              const heading = document.querySelector("main h1");
              if (heading?.textContent === targetHeading) {
                const help = document.querySelector(
                  "main > section > p:last-of-type",
                );
                const footer = document.querySelector("footer");
                if (help && footer)
                  samples.push({
                    headingY: heading.getBoundingClientRect().y,
                    helpY: help.getBoundingClientRect().y,
                    footerY: footer.getBoundingClientRect().y,
                  });
              }
              if (state.running) requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }, heading);
          await link.click();
          await expect(link.locator("[data-navigation-pending]")).toHaveCount(
            1,
          );
          await expect
            .poll(() =>
              link
                .locator("[data-navigation-pending]")
                .evaluate((element) => getComputedStyle(element).opacity),
            )
            .toBe("1");
          await expect(link.locator('[aria-live="polite"]')).toHaveText(
            locale === "fi" ? "Ladataan" : "Loading",
          );
          expect(
            await originalHeading!.evaluate((element) => element.isConnected),
          ).toBe(true);
          expect(await page.getByRole("main").boundingBox()).toEqual(
            sourceBounds,
          );
          expect(await page.getByRole("contentinfo").boundingBox()).toEqual(
            footerBounds,
          );
          expect(await link.boundingBox()).toEqual(linkBounds);
          await expect(
            page
              .getByRole("main")
              .getByRole("heading", { name: heading, exact: true }),
          ).toHaveCount(0);
          if (locale === "en" && count === 1 && source === "browse") {
            await page.screenshot({
              path: info.outputPath("reservations-pending.png"),
            });
          }
          release();
          await expect(page).toHaveURL(target);
          await expect(
            page
              .getByRole("main")
              .getByRole("heading", { name: heading, exact: true }),
          ).toBeVisible();
          await expect(link).toHaveAttribute("aria-current", "page");
          await expect(
            page.locator("[data-loading-preview]"),
          ).not.toBeVisible();
          await expect(link.locator("[data-navigation-pending]")).toHaveCount(
            0,
          );
          await expect(
            page.getByRole("button", {
              name: locale === "fi" ? "Peru varaus" : "Cancel reservation",
              exact: true,
            }),
          ).toHaveCount(count);
          if (!count) {
            await expect(
              page.getByRole("heading", {
                name:
                  locale === "fi"
                    ? "Ei aktiivisia varauksia"
                    : "No active reservations",
                exact: true,
              }),
            ).toBeVisible();
          }
          const samples = await page.evaluate(async () => {
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            );
            const state = (
              window as typeof window & {
                reservationNavigation: {
                  samples: {
                    headingY: number;
                    helpY: number;
                    footerY: number;
                  }[];
                  running: boolean;
                };
              }
            ).reservationNavigation;
            state.running = false;
            return state.samples;
          });
          expect(samples.length).toBeGreaterThan(0);
          for (const coordinate of ["headingY", "helpY", "footerY"] as const) {
            const positions = samples.map((sample) => sample[coordinate]);
            expect(
              Math.max(...positions) - Math.min(...positions),
              coordinate,
            ).toBeLessThanOrEqual(1);
          }
          await page.goBack();
          await expect(page).toHaveURL(`/${locale}/${source}`);
          await page.goForward();
          await expect(page).toHaveURL(target);
          await expect(
            page
              .getByRole("main")
              .getByRole("heading", { name: heading, exact: true }),
          ).toBeVisible();
        } finally {
          release();
          await page.unroute(pattern);
        }
      }
    });
  }
}

test("streamed loading previews reserve space, hide decorative content and respect reduced motion", async ({
  page,
  browser,
}, info) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  // Prevent React from replacing the streamed fallback so its real HTML/CSS can be inspected.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
    viewport: page.viewportSize(),
    reducedMotion: "reduce",
  });
  try {
    const previewPage = await context.newPage();
    for (const path of [
      "/en/browse",
      "/en/lists",
      "/en/lists?shared=1",
      "/en/account/profile",
      "/en/lists/e2e-loading-list",
      "/en/lists/e2e-loading-list/edit",
      "/en/lists/e2e-loading-list/sharing",
      "/en/lists/e2e-loading-list/guest-links",
      "/en/lists/e2e-loading-list/wishes/e2e-loading-wish",
      "/en/lists/e2e-loading-list/wishes/new",
      "/en/lists/e2e-loading-list/wishes/e2e-loading-wish/edit",
    ]) {
      await previewPage.goto(new URL(path, page.url()).href);
      const preview = previewPage.locator("[data-loading-preview]").first();
      await expect(preview).toBeVisible();
      const expectedHeading = path.includes("?shared=1")
        ? "My lists"
        : path.endsWith("/edit")
          ? path.includes("/wishes/")
            ? "Edit wish"
            : "List settings"
          : path.endsWith("/new")
            ? "Add a wish"
            : path.endsWith("/sharing")
              ? "List access"
              : path.endsWith("/guest-links")
                ? "Guest links"
                : null;
      if (expectedHeading) {
        const previewHeading = preview.locator("h1");
        // Without JavaScript, nested routes can remain on the parent fallback.
        const previewTitle = (await previewHeading.count())
          ? await previewHeading.textContent()
          : null;
        const parentFallback =
          ((path.endsWith("/sharing") ||
            path.endsWith("/guest-links") ||
            path.endsWith("/edit") ||
            path.endsWith("/new")) &&
            (previewTitle === null || previewTitle === "My lists")) ||
          (path.includes("?shared=1") && previewTitle === "My lists");
        if (parentFallback) {
          await expect(preview.getByRole("status")).toHaveText(
            previewTitle === "My lists"
              ? "Loading my lists…"
              : "Loading editor…",
          );
        } else {
          await expect(previewHeading).toHaveText(expectedHeading);
        }
        await previewPage.evaluate(() => document.fonts.ready);
        const previewBounds = parentFallback
          ? null
          : await previewHeading.boundingBox();
        await page.goto(path);
        const heading = page.getByRole("heading", {
          name: expectedHeading,
          exact: true,
        });
        await expect(heading).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        if (previewBounds) {
          expect(await heading.boundingBox()).toEqual(previewBounds);
        }
        await previewPage.screenshot({
          path: info.outputPath(`${path.split("/").at(-1)}-loading.png`),
          fullPage: true,
        });
      }
      await expect(preview.getByRole("status")).toContainText("Loading");
      const decorativeContent = preview.locator(
        '[aria-hidden="true"][aria-busy="true"]',
      );
      await expect(decorativeContent).toHaveCount(1);
      if (path === "/en/browse" || path === "/en/account/profile") {
        await expect(decorativeContent).toHaveAttribute("inert", "");
      }
      expect((await preview.boundingBox())!.height).toBeGreaterThan(300);
      const animation = await preview
        .locator('[class*="block"]')
        .first()
        .evaluate((element) => getComputedStyle(element).animationName);
      expect(animation).toBe("none");
      expect(
        await previewPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (
        path === "/en/lists" ||
        path.endsWith("/wishes/e2e-loading-wish") ||
        path.endsWith("/new") ||
        path.endsWith("/edit")
      ) {
        const viewport = previewPage.viewportSize()!;
        await previewPage.setViewportSize({ width: 320, height: 727 });
        await previewPage.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        expect(
          await previewPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await previewPage.evaluate(() => {
          document.documentElement.style.removeProperty("font-size");
        });
        await previewPage.setViewportSize(viewport);
      }
      if (path === "/en/browse" || path === "/en/account/profile") {
        await previewPage.screenshot({
          path: info.outputPath(
            path === "/en/browse"
              ? "browse-loading.png"
              : "profile-loading.png",
          ),
          fullPage: true,
        });
      }
    }
  } finally {
    await context.close();
  }
});
