import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-header-consistency";
const title = "Admin list";
const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(accounts.owner.email);
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
        title,
        theme: "cosmic",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        visibility: "PUBLIC",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

for (const locale of ["en", "fi"] as const) {
  const fi = locale === "fi";
  test(`${locale}: classic and themed headers have one access link and aligned actions in every visibility state`, async ({
    page,
  }, info) => {
    await signIn(page);
    await page.goto(`/en/lists/${listId}/edit`);
    const buffer = await sharp({
      create: { width: 200, height: 300, channels: 3, background: "#c4a889" },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer });
    await page
      .getByRole("textbox", { name: "Image description", exact: true })
      .fill("A portrait list cover");
    await page
      .getByRole("button", { name: "Upload image", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Save confirmation" }),
    ).toContainText("Image saved");
    const db = testPrisma();
    try {
      for (const theme of ["classic", "cosmic"] as const) {
        for (const state of [
          { name: "public", publication: "PUBLISHED", visibility: "PUBLIC" },
          { name: "private", publication: "PUBLISHED", visibility: "PRIVATE" },
          { name: "hidden", publication: "DRAFT", visibility: "PRIVATE" },
        ] as const) {
          await db.wishlist.update({
            where: { id: listId },
            data: {
              theme,
              publication: state.publication,
              visibility: state.visibility,
            },
          });
          await page.goto(`/${locale}/lists/${listId}`);
          const header = page.locator("main header").filter({
            has: page.getByRole("heading", { name: title, exact: true }),
          });
          const access = header.getByRole("link", {
            name: fi ? "Listan käyttöoikeudet" : "List access",
            exact: true,
          });
          const action = header.getByRole("button", {
            name:
              state.name === "hidden"
                ? fi
                  ? "Julkaise lista"
                  : "Publish list"
                : fi
                  ? "Piilota lista"
                  : "Hide list",
            exact: true,
          });
          await expect(access).toHaveCount(1);
          await expect(
            header.locator(`a[href="/${locale}/lists/${listId}/sharing"]`),
          ).toHaveCount(1);
          await expect(action).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          for (const dark of [false, true]) {
            await page.setViewportSize({ width: 1280, height: 900 });
            await page.evaluate((dark) => {
              document.documentElement.classList.toggle("dark", dark);
              document.documentElement.style.fontSize = "";
            }, dark);
            const buttons = [
              action,
              access,
              header.getByRole("button", {
                name: fi ? "QR-kortti" : "QR card",
                exact: true,
              }),
              header.getByRole("link", {
                name: fi ? "Listan asetukset" : "List settings",
                exact: true,
              }),
            ];
            const bounds = await Promise.all(
              buttons.map((button) => button.boundingBox()),
            );
            for (const box of bounds) {
              expect(Math.abs(box!.y - bounds[0]!.y)).toBeLessThanOrEqual(1);
              expect(
                Math.abs(box!.height - bounds[0]!.height),
              ).toBeLessThanOrEqual(1);
            }
            const status = header.getByRole("region", {
              name: fi ? "Listan näkyvyys" : "List visibility",
              exact: true,
            });
            const statusBounds = (await status.boundingBox())!;
            expect(statusBounds.y + statusBounds.height).toBeLessThanOrEqual(
              bounds[0]!.y,
            );
            await header.screenshot({
              path: info.outputPath(
                `${locale}-${theme}-${state.name}-${dark ? "dark" : "light"}-desktop.png`,
              ),
            });
            await page.setViewportSize({ width: 320, height: 900 });
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "200%";
            });
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            expect(
              await header.evaluate(
                (element) => element.scrollWidth <= element.clientWidth,
              ),
            ).toBe(true);
            await expect(action).toBeVisible();
            await header.screenshot({
              path: info.outputPath(
                `${locale}-${theme}-${state.name}-${dark ? "dark" : "light"}-320-200.png`,
              ),
            });
          }
        }
      }
      expect(
        (await new AxeBuilder({ page }).include("main header").analyze())
          .violations,
      ).toEqual([]);
    } finally {
      await db.$disconnect();
    }
  });

  test(`${locale}: Publish reviews the audience, cancellation changes nothing, and private publishing stays private`, async ({
    page,
    request,
  }, info) => {
    const db = testPrisma();
    try {
      await db.wishlist.update({
        where: { id: listId },
        data: { publication: "DRAFT", visibility: "PUBLIC" },
      });
      await signIn(page);
      await page.goto(`/${locale}/lists/${listId}`);
      const publish = page.getByRole("button", {
        name: fi ? "Julkaise lista" : "Publish list",
        exact: true,
      });
      await publish.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", {
        name: fi ? "Julkaise lista" : "Publish list",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
      await expect(dialog.getByRole("heading")).toBeFocused();
      await expect(
        dialog.getByRole("radio", {
          name: fi ? "Piilotettu" : "Hidden",
          exact: true,
        }),
      ).toHaveCount(0);
      const selected = dialog.getByRole("radio", {
        name: fi ? "Kutsutut henkilöt" : "Invited people",
        exact: true,
      });
      await selected.check();
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
      await expect(publish).toBeFocused();
      expect(
        (await db.wishlist.findUniqueOrThrow({ where: { id: listId } }))
          .publication,
      ).toBe("DRAFT");
      await publish.click();
      await expect(
        dialog.getByRole("radio", {
          name: fi ? "Julkinen" : "Public",
          exact: true,
        }),
      ).toBeChecked();
      await selected.check();
      const save = dialog.getByRole("button", {
        name: fi ? "Jaa kutsutuille henkilöille" : "Share with invited people",
        exact: true,
      });
      await save.click();
      await expect(dialog.getByRole("checkbox")).toBeFocused();
      expect(
        (await db.wishlist.findUniqueOrThrow({ where: { id: listId } }))
          .publication,
      ).toBe("DRAFT");
      await dialog.getByRole("checkbox").check();
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(() => {
        document.documentElement.classList.add("dark");
        document.documentElement.style.fontSize = "200%";
      });
      expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(300);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await dialog.screenshot({
        path: info.outputPath(`${locale}-publish-review-320-200.png`),
      });
      await save.click();
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole("button", {
          name: fi ? "Piilota lista" : "Hide list",
          exact: true,
        }),
      ).toBeFocused();
      expect(
        await db.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toMatchObject({ publication: "PUBLISHED", visibility: "PRIVATE" });
      expect(
        await (await request.get(`/en/lists/${listId}`)).text(),
      ).not.toContain(title);
    } finally {
      await db.$disconnect();
    }
  });
}

test("a stale header cannot hide a list after another admin changes the audience", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/en/lists/${listId}`);
  const hide = page.getByRole("button", { name: "Hide list", exact: true });
  await expect(hide).toBeVisible();
  const db = testPrisma();
  try {
    await db.wishlist.update({
      where: { id: listId },
      data: { visibility: "PRIVATE" },
    });
    await hide.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "List access changed",
    );
    expect(
      await db.wishlist.findUniqueOrThrow({ where: { id: listId } }),
    ).toMatchObject({ publication: "PUBLISHED", visibility: "PRIVATE" });
  } finally {
    await db.$disconnect();
  }
});
