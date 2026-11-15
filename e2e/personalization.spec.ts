import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { listThemeIds, listThemes } from "../src/features/premium/themes";
import { accounts, resetFixtures, testPrisma } from "./seed";
const listId = "e2e-personalized-list";
const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};
test.beforeEach(async () => {
  await resetFixtures();
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
        id: listId,
        title: "Birthday wishes",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
});
for (const theme of ["botanical", "geometry", "cosmic"] as const) {
  test(`${theme}: themes persist, show in the list and export a QR card`, async ({
    page,
  }, info) => {
    await signIn(page);
    await page.goto(`/en/lists/${listId}/edit`);
    await page
      .getByRole("radio", { name: listThemes[theme].name, exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Changes saved." }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("radio", { name: listThemes[theme].name, exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: info.outputPath("list-settings.png"),
      fullPage: true,
    });
    await page.goto(`/en/lists/${listId}`);
    await expect(
      page.getByRole("heading", { name: "Birthday wishes", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(`[data-list-theme="${theme}"]:visible`),
    ).toBeVisible();
    const sharingButton = page.getByRole("button", {
      name: "QR card",
      exact: true,
    });
    await sharingButton.click();
    const dialog = page.getByRole("dialog", {
      name: "QR card",
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("PNG image · 1200 × 800 pixels · QR code included"),
    ).toBeVisible();
    const preview = dialog.getByRole("img", {
      name: "QR card for Birthday wishes",
    });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate(
          (image: HTMLImageElement) =>
            image.complete && image.naturalWidth === 1200,
        ),
      )
      .toBe(true);
    const toolbarDownload = page.waitForEvent("download");
    await dialog
      .getByRole("link", { name: "Download QR card", exact: true })
      .click();
    expect(await (await toolbarDownload).failure()).toBeNull();
    await page.screenshot({
      path: info.outputPath("sharing-card-dialog.png"),
      fullPage: true,
    });
    const dialogAudit = await new AxeBuilder({ page }).analyze();
    expect(dialogAudit.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(sharingButton).toBeFocused();
    await expect(
      page.locator(`[data-list-theme="${theme}"]:visible`),
    ).toContainText("Birthday wishes");
    await page.screenshot({
      path: info.outputPath("themed-list.png"),
      fullPage: true,
    });
    const errors = await new AxeBuilder({ page }).include("main").analyze();
    expect(errors.violations).toEqual([]);
  });
}
test("profile badge is opt-in and can be hidden", async ({ page }) => {
  await signIn(page);
  await page.goto("/en/account/profile");
  const toggle = page.getByRole("checkbox", { name: /Show a Premium badge/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }),
  ).toBeVisible();
  await page.goto("/en/browse?view=users");
  const person = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "e2e-owner", exact: true }),
  });
  await expect(person.getByText("Premium", { exact: true })).toBeVisible();
  const heading = await person
    .getByRole("heading", { name: "e2e-owner", exact: true })
    .boundingBox();
  const badge = await person
    .getByText("Premium", { exact: true })
    .boundingBox();
  expect(Math.abs((heading?.y ?? 0) - (badge?.y ?? 100))).toBeLessThan(24);
  const favorite = await person
    .getByRole("button", { name: "Add e2e-owner to favorites", exact: true })
    .boundingBox();
  const toolbar = await person.locator('[class*="user-heading"]').boundingBox();
  const ownership = await person
    .getByText("You", { exact: true })
    .boundingBox();
  expect(favorite).not.toBeNull();
  expect(toolbar).not.toBeNull();
  expect(ownership).not.toBeNull();
  expect(
    Math.abs(favorite!.x + favorite!.width - toolbar!.x - toolbar!.width),
  ).toBeLessThan(2);
  expect(favorite!.x).toBeGreaterThan(ownership!.x + ownership!.width);
  await person.screenshot({ path: test.info().outputPath("profile-card.png") });
  await page.goto("/en/account/profile");
  await page.getByRole("checkbox", { name: /Show a Premium badge/ }).uncheck();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }),
  ).toBeVisible();
  await page.goto("/en/browse?view=users");
  await expect(person.getByText("Premium", { exact: true })).toHaveCount(0);
});
test("a free list owner can find QR cards and sees the Premium requirement", async ({
  page,
}, info) => {
  const db = testPrisma();
  try {
    await db.premiumGrant.updateMany({
      where: { userId: "e2e-owner" },
      data: { revokedAt: new Date() },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page);
  await page.goto(`/en/lists/${listId}`);
  await page.getByRole("button", { name: "QR card", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "QR card",
  });
  await expect(
    dialog.getByText("The list owner needs Premium to download QR cards."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Download QR card", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("link", { name: "Explore Premium", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(3);
  for (const name of ["Birthday", "Christmas", "Botanical"]) {
    await dialog.getByRole("radio", { name, exact: true }).check();
    const preview = dialog.getByRole("img", {
      name: `Example QR card in the ${name} theme`,
    });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  expect(
    (
      await page.request.get(`/api/lists/${listId}/sharing-card?locale=en`)
    ).status(),
  ).toBe(404);
  await dialog.screenshot({ path: info.outputPath("free-sharing-card.png") });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.locator('[data-list-theme="classic"]').first(),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  for (const locale of ["en", "fi"]) {
    await page.goto(`/${locale}/lists/${listId}`);
    await page
      .getByRole("button", {
        name: locale === "fi" ? "QR-kortti" : "QR card",
        exact: true,
      })
      .click();
    const exampleDialog = page.getByRole("dialog");
    await exampleDialog.getByRole("radio").last().check();
    await page.setViewportSize({ width: 320, height: 800 });
    for (const dark of [false, true]) {
      await page.evaluate((dark) => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.fontSize = "200%";
      }, dark);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await exampleDialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await exampleDialog.screenshot({
        path: info.outputPath(
          `free-preview-${locale}-${dark ? "dark" : "light"}.png`,
        ),
      });
      expect(
        (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
      ).toEqual([]);
    }
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  }
});
test("premium showcase works in both languages and themes without overflow", async ({
  page,
}, info) => {
  for (const locale of ["en", "fi"]) {
    await page.goto(`/${locale}/premium`);
    await expect(page.getByRole("radio")).toHaveCount(listThemeIds.length);
    for (const theme of listThemeIds.filter((id) => id !== "classic")) {
      const choice = page.locator(`label[data-theme="${theme}"]`);
      await choice.getByRole("radio").check();
      await expect(page.locator(`[data-list-theme="${theme}"]`)).toBeVisible();
      await expect
        .poll(() =>
          choice
            .locator("img")
            .evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
            ),
        )
        .toBe(true);
    }
    await page
      .getByRole("radio", {
        name: locale === "fi" ? "Rakkaus" : "Love",
        exact: true,
      })
      .check();
    await expect(page.locator('[data-list-theme="wedding"]')).toBeVisible();
    await expect(
      page.getByRole("img", {
        name:
          locale === "fi"
            ? "Esimerkki syntymäpäivän QR-kortista, jossa on listan nimi ja QR-koodi"
            : "Example birthday QR card with a list title and QR code",
      }),
    ).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      await page.evaluate((value) => {
        document.documentElement.classList.toggle("dark", value === "dark");
        document.documentElement.style.colorScheme = value;
      }, scheme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page }).include("main").analyze();
      expect(result.violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`premium-${locale}-${scheme}.png`),
        fullPage: true,
      });
    }
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    const labels = page.getByRole("radio").locator("..");
    for (const label of await labels.all()) {
      expect(
        await label.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    if (viewport) await page.setViewportSize(viewport);
  }
});

test("Classic sharing-card preview retries a failure and keeps its dialog usable", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/lists/${listId}`);
  let requests = 0;
  await page.route(
    `**/api/lists/${listId}/sharing-card?locale=en`,
    async (route) => {
      requests += 1;
      if (requests === 1) await route.fulfill({ status: 503 });
      else await route.continue();
    },
  );
  const trigger = page.getByRole("button", {
    name: "QR card",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "QR card" });
  await expect(dialog.getByRole("alert")).toHaveText(
    "Card unavailable. Check your access and try again.",
  );
  await dialog.getByRole("button", { name: "Preview QR card" }).click();
  const preview = dialog.getByRole("img", {
    name: "QR card for Birthday wishes",
  });
  await expect(preview).toBeVisible();
  await expect
    .poll(() =>
      preview.evaluate(
        (image: HTMLImageElement) =>
          image.complete && image.naturalWidth === 1200,
      ),
    )
    .toBe(true);
  expect(requests).toBe(2);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
