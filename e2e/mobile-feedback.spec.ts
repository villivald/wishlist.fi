import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listPath = "/lists/e2e-mobile-feedback";
const signIn = async (page: Page) => {
  page.on("dialog", (dialog) => dialog.accept());
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
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.wishlist.create({
      data: {
        id: "e2e-mobile-feedback",
        title: "Admin list",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: "e2e-mobile-feedback-wish",
            title: "A thoughtful gift",
            authorId: "e2e-owner",
          },
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test("mobile header groups actions and keeps toast dismissal within the viewport", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(`/en${listPath}/edit`);
  const buffer = await sharp({
    create: { width: 160, height: 120, channels: 3, background: "#bcc9b4" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Image description", { exact: true })
    .fill("List cover");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "List cover", exact: true }),
  ).toBeVisible();
  for (const locale of ["en", "fi"]) {
    for (const [width, enlarged] of [
      [320, false],
      [390, false],
      [320, true],
    ] as const) {
      await page.setViewportSize({ width, height: 740 });
      await page.goto(`/${locale}${listPath}`);
      const header = page.locator("header").filter({
        has: page.getByRole("heading", { name: "Admin list", exact: true }),
      });
      await expect(header).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate((enlarged) => {
        document.documentElement.classList.toggle("dark", enlarged);
        document.documentElement.style.fontSize = enlarged ? "200%" : "";
      }, enlarged);
      const sharing = header.getByRole("button", {
        name: locale === "fi" ? "QR-kortti" : "QR card",
        exact: true,
      });
      const settings = header.getByRole("link", {
        name: locale === "fi" ? "Listan asetukset" : "List settings",
        exact: true,
      });
      await expect(sharing).toBeVisible();
      if (!enlarged) {
        const first = await sharing.boundingBox();
        const second = await settings.boundingBox();
        expect(Math.abs(first!.y - second!.y)).toBeLessThanOrEqual(1);
        await expect(
          page.getByRole("heading", {
            name: locale === "fi" ? "Toiveet" : "Wishes",
            exact: true,
            level: 2,
          }),
        ).toBeInViewport();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const hide = header.getByRole("button", {
        name: locale === "fi" ? "Piilota lista" : "Hide list",
        exact: true,
      });
      if (await hide.isVisible()) {
        await hide.click();
      } else {
        const name = locale === "fi" ? "Julkaise lista" : "Publish list";
        await header.getByRole("button", { name, exact: true }).click();
        const publish = page.getByRole("dialog", { name });
        await publish.getByRole("checkbox").check();
        await publish
          .getByRole("button", {
            name:
              locale === "fi" ? "Tee listasta julkinen" : "Make list public",
            exact: true,
          })
          .click();
      }
      const toast = page.getByRole("status", {
        name: locale === "fi" ? "Tallennusvahvistus" : "Save confirmation",
      });
      await expect(toast).toBeVisible();
      const box = (await toast.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(740);
      expect(
        await toast.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await toast.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      // Use the actual localized label rather than relying on its wording.
      const dismiss = toast.getByRole("button");
      await expect(dismiss).toBeInViewport();
      const dismissBox = (await dismiss.boundingBox())!;
      const visibleToast = (await toast.boundingBox())!;
      expect(dismissBox.height).toBeGreaterThanOrEqual(44);
      expect(dismissBox.y).toBeGreaterThanOrEqual(visibleToast.y);
      expect(dismissBox.y + dismissBox.height).toBeLessThanOrEqual(
        visibleToast.y + visibleToast.height,
      );
      await page.screenshot({
        path: info.outputPath(
          `mobile-${locale}-${width}-${enlarged ? "large" : "normal"}.png`,
        ),
        fullPage: false,
      });
      expect(
        (
          await new AxeBuilder({ page })
            .include("main")
            .include('[role="status"][aria-label]')
            .analyze()
        ).violations,
      ).toEqual([]);
      await dismiss.click();
      await expect(toast).toHaveCount(0);
      await sharing.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", {
          name: locale === "fi" ? "Sulje QR-kortti" : "Close QR card",
        })
        .click();
      await expect(dialog).not.toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
    }
  }
});

test("toast follows the visible viewport when an on-screen keyboard reduces it", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/en${listPath}`);
  await page.getByRole("button", { name: "Hide list", exact: true }).click();
  const toast = page.getByRole("status", { name: "Save confirmation" });
  await expect(toast).toBeVisible();
  await page.evaluate(() => {
    if (!window.visualViewport) throw new Error("Visual viewport unavailable");
    Object.defineProperty(window.visualViewport, "height", {
      configurable: true,
      value: 420,
    });
    window.visualViewport.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => {
      const box = await toast.boundingBox();
      return box ? box.y + box.height : Infinity;
    })
    .toBeLessThanOrEqual(420);
  await expect(toast.getByRole("button")).toBeInViewport();
  await page.evaluate(() => {
    Reflect.deleteProperty(window.visualViewport!, "height");
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
});

for (const locale of ["en", "fi"]) {
  test(`${locale}: routine redirect confirmations expire and consumed flags do not replay`, async ({
    page,
  }) => {
    await signIn(page);
    await page.clock.install();
    const cases: [string, string][] = [
      [`${listPath}/wishes/e2e-mobile-feedback-wish`, "created=1"],
      [`${listPath}/wishes/e2e-mobile-feedback-wish`, "saved=1"],
      [listPath, "created=1"],
      [listPath, "saved=1"],
      [listPath, "wishDeleted=1"],
      ["/lists", "deleted=1"],
      ["/reservations", "canceled=1"],
      ["/lists/shared", "roleChanged=1"],
      ["/lists/shared", "joined=1"],
      ["/lists/shared", "left=1"],
      [`${listPath}/sharing`, "changed=removed"],
      [`${listPath}/sharing`, "changed=revoked"],
      [`${listPath}/sharing`, "changed=transferred"],
      [`${listPath}/guest-links`, "revoked=1"],
    ];
    for (const [route, flag] of cases) {
      await page.goto(`/${locale}${route}?${flag}&utm_source=qa#confirmation`);
      const toast = page.getByRole("status", {
        name: locale === "fi" ? "Tallennusvahvistus" : "Save confirmation",
      });
      await expect(toast).toBeVisible();
      await expect(page).not.toHaveURL(new RegExp(flag));
      expect(new URL(page.url()).searchParams.get("utm_source")).toBe("qa");
      expect(new URL(page.url()).hash).toBe("#confirmation");
      await page.clock.fastForward(9000);
      await expect(toast).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(toast).toHaveCount(0);
    }
  });
}
