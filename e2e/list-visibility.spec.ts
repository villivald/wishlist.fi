import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { accounts, resetFixtures, testPrisma } from "./seed";

const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

test.beforeEach(resetFixtures);

const shareList = async (
  page: Page,
  access: "PUBLIC" | "PRIVATE",
  locale: "en" | "fi" = "en",
) => {
  const path = new URL(page.url()).pathname;
  await page
    .getByRole("link", {
      name: locale === "fi" ? "Listan käyttöoikeudet" : "List access",
      exact: true,
    })
    .click();
  const region = page.getByRole("region", {
    name:
      locale === "fi" ? "Kuka näkee tämän listan?" : "Who can view this list?",
    exact: true,
  });
  await region
    .getByRole("radio", {
      name:
        access === "PUBLIC"
          ? locale === "fi"
            ? "Julkinen"
            : "Public"
          : locale === "fi"
            ? "Kutsutut henkilöt"
            : "Invited people",
      exact: true,
    })
    .check();
  await region.getByRole("checkbox").check();
  const save = region.getByRole("button", {
    name:
      access === "PUBLIC"
        ? locale === "fi"
          ? "Tee listasta julkinen"
          : "Make list public"
        : locale === "fi"
          ? "Jaa kutsutuille henkilöille"
          : "Share with invited people",
    exact: true,
  });
  await save.click();
  await expect(region.locator('button[type="submit"]')).toHaveCount(0);
  await page.goto(path);
};

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: a new list can start hidden, keeps its choice after validation, and can be shared later`, async ({
    page,
    browser,
  }, info) => {
    await signIn(page);
    await page.goto(`/${locale}/lists/new`);
    const titleLabel = locale === "fi" ? "Nimi" : "Title";
    const createLabel = locale === "fi" ? "Luo lista" : "Create list";
    const choices = page.getByRole("group", {
      name:
        locale === "fi"
          ? "Kuka näkee tämän listan?"
          : "Who can view this list?",
      exact: true,
    });
    const hidden = choices.getByRole("radio", {
      name: locale === "fi" ? "Piilotettu" : "Hidden",
      exact: true,
    });
    await hidden.focus();
    await page.keyboard.press("Space");
    await expect(hidden).toBeChecked();
    await page.getByLabel(titleLabel, { exact: true }).fill("   ");
    await page.getByRole("button", { name: createLabel, exact: true }).click();
    await expect(page.getByLabel(titleLabel, { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(hidden).toBeChecked();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate((dark) => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.fontSize = "";
      }, dark);
      await choices.screenshot({
        path: info.outputPath(
          `creation-${locale}-${dark ? "dark" : "light"}.png`,
        ),
      });
      await page.setViewportSize({ width: 320, height: 800 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await choices.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await choices.screenshot({
        path: info.outputPath(
          `creation-${locale}-${dark ? "dark" : "light"}-320.png`,
        ),
      });
    }
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page
      .getByLabel(titleLabel, { exact: true })
      .fill("Hidden from the start");
    await page.getByRole("button", { name: createLabel, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Hidden from the start", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: locale === "fi" ? "Listan käyttöoikeudet" : "List access",
        exact: true,
      }),
    ).toBeVisible();
    const db = testPrisma();
    try {
      const id = new URL(page.url()).pathname.split("/").at(-1)!;
      expect(
        await db.wishlist.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ publication: "DRAFT", visibility: "PUBLIC" });
    } finally {
      await db.$disconnect();
    }
    const visitor = await browser.newPage();
    try {
      await visitor.goto(page.url());
      await expect(
        visitor.getByRole("heading", {
          name: "Hidden from the start",
          exact: true,
        }),
      ).toHaveCount(0);
      await shareList(page, "PUBLIC", locale);
      await expect(
        page.getByRole("button", {
          name: locale === "fi" ? "Piilota lista" : "Hide list",
          exact: true,
        }),
      ).toBeVisible();
      await visitor.reload();
      await expect(
        visitor.getByRole("heading", {
          name: "Hidden from the start",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await visitor.close();
    }
  });
}

test("new lists explain their visible state and can be hidden from the list page", async ({
  page,
  browser,
}, info) => {
  await signIn(page);
  await page.goto("/en/lists/new");
  await expect(
    page.getByRole("radio", { name: "Public", exact: true }),
  ).toBeChecked();
  await page.getByLabel("Title", { exact: true }).fill("Ready when I am");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ready when I am", exact: true }),
  ).toBeVisible();
  const path = new URL(page.url()).pathname;
  const control = page.getByRole("region", {
    name: "List visibility",
    exact: true,
  });
  const header = page.locator("header").filter({
    has: page.getByRole("heading", { name: "Ready when I am", exact: true }),
  });
  await expect(
    header.getByRole("region", { name: "List visibility", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("link", { name: "List settings", exact: true }),
  ).toBeVisible();
  await expect(
    header.getByRole("button", { name: "QR card", exact: true }),
  ).toBeVisible();
  await header.screenshot({ path: info.outputPath("list-header.png") });
  await expect(control).toContainText("Public · Anyone can view");
  await expect(
    page.getByRole("button", { name: "Hide list", exact: true }),
  ).toBeVisible();
  const bounds = await control.boundingBox();
  expect(bounds?.height).toBeLessThanOrEqual(
    (page.viewportSize()?.width ?? 0) >= 768 ? 80 : 170,
  );
  expect(
    (await page.getByRole("button", { name: "Hide list" }).boundingBox())
      ?.height,
  ).toBeGreaterThanOrEqual(44);
  await control.screenshot({ path: info.outputPath("compact-visibility.png") });
  await page.reload();
  await expect(control).toContainText("Public · Anyone can view");

  const visitor = await browser.newPage();
  try {
    await visitor.goto(page.url());
    await expect(
      visitor.getByRole("heading", { name: "Ready when I am", exact: true }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("region", { name: "List visibility", exact: true }),
    ).toHaveCount(0);
    const nativeDialogs: string[] = [];
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Hide list", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Publish list", exact: true }),
    ).toBeVisible();
    await expect(control).toContainText("Hidden · Admins only");
    expect(nativeDialogs).toEqual([]);
    await visitor.reload();
    await expect(
      visitor.getByRole("heading", { name: "Ready when I am", exact: true }),
    ).toHaveCount(0);
    const db = testPrisma();
    try {
      expect(
        (
          await db.wishlist.findUniqueOrThrow({
            where: { id: path.split("/").at(-1)! },
          })
        ).publication,
      ).toBe("DRAFT");
    } finally {
      await db.$disconnect();
    }
  } finally {
    await visitor.close();
  }
});

test("showing a private list preserves its audience and controls fit both languages", async ({
  page,
  browser,
}, info) => {
  const db = testPrisma();
  try {
    await db.premiumGrant.create({
      data: {
        userId: "e2e-owner",
        startsAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.wishlist.create({
      data: {
        id: "e2e-private-visibility",
        title: "Private wishes",
        ownerId: "e2e-owner",
        visibility: "PRIVATE",
        publication: "DRAFT",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page);
  await page.goto("/en/lists/e2e-private-visibility");
  const control = page.getByRole("region", {
    name: "List visibility",
    exact: true,
  });
  await expect(control).toContainText(
    "Publish to choose who can view this list.",
  );
  await shareList(page, "PRIVATE");
  await expect(control).toContainText("Invited people · Private");
  const visitor = await browser.newPage();
  try {
    await visitor.goto(page.url());
    await expect(
      visitor.getByRole("heading", { name: "Private wishes", exact: true }),
    ).toHaveCount(0);
  } finally {
    await visitor.close();
  }

  for (const locale of ["en", "fi"]) {
    await page.goto(`/${locale}/lists/e2e-private-visibility`);
    await page.setViewportSize({ width: 320, height: 800 });
    for (const dark of [false, true]) {
      await page.evaluate((dark) => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.fontSize = "";
      }, dark);
      const panel = page.getByRole("main").locator("#list-visibility");
      await expect(panel).toBeVisible();
      expect((await panel.boundingBox())?.height).toBeLessThanOrEqual(180);
      await panel.screenshot({
        path: info.outputPath(
          `compact-${locale}-${dark ? "dark" : "light"}.png`,
        ),
      });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await panel.screenshot({
        path: info.outputPath(
          `visibility-${locale}-${dark ? "dark" : "light"}.png`,
        ),
      });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
  }
});

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: hiding reserved wishes requires review, cancellation is harmless and new reservations require another review`, async ({
    page,
  }, info) => {
    const db = testPrisma();
    const listId = "e2e-reserved-hide";
    try {
      await db.wishlist.create({
        data: {
          id: listId,
          title: "Reserved gifts",
          ownerId: "e2e-owner",
          publication: "PUBLISHED",
          reservationsEnabled: true,
          memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
          wishes: {
            create: [
              { id: "e2e-hide-book", title: "Garden book" },
              { id: "e2e-hide-cup", title: "Coffee cup" },
            ],
          },
        },
      });
      await db.reservation.create({
        data: {
          id: "e2e-hide-first",
          wishId: "e2e-hide-book",
          userId: "e2e-member",
        },
      });
      await signIn(page);
      await page.goto(`/${locale}/lists/${listId}`);
      const hideLabel = locale === "fi" ? "Piilota lista" : "Hide list";
      const confirmLabel =
        locale === "fi"
          ? "Piilota lista ja päätä varaukset"
          : "Hide list and end reservations";
      const cancelLabel = locale === "fi" ? "Peruuta" : "Cancel";
      const trigger = page.getByRole("button", {
        name: hideLabel,
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText("Garden book", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: cancelLabel, exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(
        (
          await db.reservation.findUniqueOrThrow({
            where: { id: "e2e-hide-first" },
          })
        ).endedAt,
      ).toBeNull();
      await trigger.click();
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: cancelLabel, exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await expect(dialog).toBeVisible();
      await db.reservation.create({
        data: {
          id: "e2e-hide-second",
          wishId: "e2e-hide-cup",
          userId: "e2e-member",
        },
      });
      await dialog.getByRole("button", { name: confirmLabel }).click();
      await expect(
        dialog.getByText("Coffee cup", { exact: true }),
      ).toBeVisible();
      expect(
        await db.reservation.count({
          where: { wish: { wishlistId: listId }, endedAt: null },
        }),
      ).toBe(2);
      expect(
        (await db.wishlist.findUniqueOrThrow({ where: { id: listId } }))
          .publication,
      ).toBe("PUBLISHED");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.setViewportSize({ width: 320, height: 800 });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await dialog.screenshot({
        path: info.outputPath(`hide-reservations-${locale}.png`),
      });
      await dialog.getByRole("button", { name: confirmLabel }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: locale === "fi" ? "Julkaise lista" : "Publish list",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await db.reservation.count({
          where: { wish: { wishlistId: listId }, endedAt: null },
        }),
      ).toBe(0);
    } finally {
      await db.$disconnect();
    }
  });
}
