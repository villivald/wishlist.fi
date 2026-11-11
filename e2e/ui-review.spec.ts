import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { openMainNavigation } from "./navigation";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-ui-public";
const wishId = "e2e-ui-wish";
const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.member.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.member.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};
const active = (page: Page) =>
  page
    .getByRole("navigation", { name: "Main navigation", includeHidden: true })
    .locator('[aria-current="page"]');

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: listId,
        title: "Gift ideas",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: wishId,
            title: "A book",
            externalUrl: "https://example.com/book",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("browse previews, reservation shortcuts and reservation navigation retain their context", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/en/browse?q=Gift+ideas");
  await page
    .getByRole("link", { name: "Open Gift ideas from preview" })
    .click();
  await expect(active(page)).toHaveText("Browse");
  await page.getByLabel("Sort wishes").selectOption("title");
  await expect(page).toHaveURL(/sort=title/);
  await expect(active(page)).toHaveText("Browse");
  await page.getByRole("link", { name: "Open A book from preview" }).click();
  await expect(active(page)).toHaveText("Browse");
  await page.getByRole("link", { name: "Back to Gift ideas" }).click();
  await expect(
    page.getByRole("link", {
      name: "Product link for A book (opens in a new tab)",
    }),
  ).toHaveAttribute("href", "https://example.com/book");
  await page.getByRole("link", { name: "Reserve A book", exact: true }).click();
  await expect(page).toHaveURL(/from=browse#reservation-heading$/);
  await page.getByRole("button", { name: "Reserve wish", exact: true }).click();
  await expect(
    page.getByText(
      "You reserved this wish. Your name is not shown with the reservation.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "My reservations", exact: true })
    .click();
  await page.getByRole("link", { name: "Open A book from preview" }).click();
  await expect(active(page)).toHaveText("My reservations");
  await page.getByRole("link", { name: "Back to Gift ideas" }).click();
  await expect(active(page)).toHaveText("My reservations");
  await page.goto(`/en/lists/${listId}`);
  await expect(active(page)).toHaveText("Browse");
});

test("own lists keep My lists active even when reservation actions are unavailable", async ({
  page,
}) => {
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: listId },
      data: {
        ownerId: "e2e-member",
        reservationsEnabled: false,
        memberships: { create: { userId: "e2e-member", role: "ADMIN" } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  await signIn(page);
  await page
    .getByRole("link", { name: "Open Gift ideas from preview" })
    .click();
  await expect(active(page)).toHaveText("My lists");
  await expect(
    page.getByRole("link", { name: "Reserve A book", exact: true }),
  ).toHaveCount(0);
  await page.goto("/en/browse?q=Gift+ideas");
  await page
    .getByRole("link", { name: "Open Gift ideas from preview" })
    .click();
  await expect(active(page)).toHaveText("Browse");
});

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: priority and wish states stay clear in both themes and with large text`, async ({
    page,
  }, info) => {
    const prisma = testPrisma();
    try {
      await prisma.wishlist.update({
        where: { id: listId },
        data: {
          memberships: { create: { userId: "e2e-member", role: "ADMIN" } },
        },
      });
      await prisma.wish.update({
        where: { id: wishId },
        data: {
          priority: 3,
          priceMinor: 2400,
          currency: "EUR",
          reservations: { create: { userId: "e2e-owner" } },
        },
      });
      await prisma.wish.createMany({
        data: [
          { wishlistId: listId, title: "Still a surprise", hidden: true },
          {
            wishlistId: listId,
            title: "Already received",
            fulfilledAt: new Date(),
          },
        ],
      });
    } finally {
      await prisma.$disconnect();
    }
    const fi = locale === "fi";
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page);
    await page.goto(`/${locale}/lists/${listId}`);
    const priority = page.getByRole("img", {
      name: fi ? "Tärkeys: 3/5 tähteä" : "Priority: 3 out of 5 stars",
    });
    await expect(priority).toHaveText(new RegExp(fi ? "Tärkeys" : "Priority"));
    await expect(
      page
        .getByRole("main")
        .getByText(fi ? "Varattu" : "Reserved", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByText(fi ? "Piilotettu" : "Hidden", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: fi ? "Varaa A book" : "Reserve A book",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`states-${locale}-light.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: fi ? "Vaihda tummaan teemaan" : "Switch to dark mode",
      })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const lightMode = page.getByRole("button", {
      name: fi ? "Vaihda vaaleaan teemaan" : "Switch to light mode",
    });
    await expect(lightMode).toHaveAttribute(
      "title",
      fi ? "Vaihda vaaleaan teemaan" : "Switch to light mode",
    );
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
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
      path: info.outputPath(`states-${locale}-dark-large.png`),
      fullPage: true,
    });
    await page
      .getByLabel(fi ? "Näytä" : "Show", { exact: true })
      .selectOption("fulfilled");
    await expect(
      page
        .getByRole("main")
        .getByText(fi ? "Toteutunut" : "Fulfilled", { exact: true }),
    ).toBeVisible();
    await lightMode.click();
    await expect(page.locator("html")).toHaveClass(/light/);
  });

  test(`${locale}: profile saving has a visible, dismissible confirmation and header avatar updates`, async ({
    page,
  }, info) => {
    await signIn(page);
    await page.goto(`/${locale}/account/profile`);
    const fi = locale === "fi";
    await page.getByLabel(fi ? "Näyttönimi" : "Display name").fill("Sam");
    await page
      .getByRole("button", {
        name: fi ? "Tallenna profiili" : "Save profile",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      fi ? "Profiili tallennettu." : "Profile saved.",
    );
    const confirmation = page.getByRole("status", {
      name: fi ? "Tallennusvahvistus" : "Save confirmation",
    });
    await expect(confirmation).toBeInViewport();
    const dismiss = confirmation.getByRole("button");
    await page
      .getByRole("button", {
        name: fi ? "Tallenna profiili" : "Save profile",
        exact: true,
      })
      .focus();
    await dismiss.focus();
    await dismiss.press("Enter");
    await expect(confirmation).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: fi ? "Tallenna profiili" : "Save profile",
        exact: true,
      }),
    ).toBeFocused();
    const avatar = page.locator("header").getByRole("link", {
      name: fi ? "Tilisi: e2e-member" : "Your account: e2e-member",
      exact: true,
    });
    await expect(avatar).toBeVisible();
    await expect(avatar.locator("img")).toHaveCount(0);
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffd803" },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer });
    await page
      .getByLabel(fi ? "Kuvan kuvaus" : "Image description", { exact: true })
      .fill("Sam’s avatar");
    await page
      .getByRole("button", {
        name: fi ? "Lataa kuva" : "Upload image",
        exact: true,
      })
      .click();
    await expect(avatar.locator("img")).toHaveCount(1);
    await page.screenshot({
      path: info.outputPath(`profile-${locale}.png`),
      fullPage: true,
    });
  });

  test(`${locale}: plan explanation is public, accurate and usable with large text and dark mode`, async ({
    page,
  }, info) => {
    const fi = locale === "fi";
    await page.goto(`/${locale}/premium`);
    await expect(
      page.getByRole("heading", {
        name: fi
          ? "Tee toivelistastasi omannäköinen."
          : "Make your wishlist your own.",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByText(
        fi ? "Tarvitsevatko kaikki Premiumin?" : "Does everyone need Premium?",
        { exact: true },
      )
      .click();
    await expect(
      page.getByText(
        fi
          ? "Vierailijalinkillä voi katsella listaa ilman tiliä. Varaamiseen tarvitaan vahvistettu tili."
          : "Guest links provide read-only access without an account. Reserving requires a verified account.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Premium", exact: true })
        .getByRole("link", {
          name: fi ? "Luo tili" : "Create account",
          exact: true,
        }),
    ).toHaveAttribute("href", `/${locale}/sign-up?returnTo=%2Faccount%2Fplan`);
    await expect(
      page.locator("footer").getByRole("link", {
        name: fi ? "Ilmainen ja Premium" : "Free and Premium",
      }),
    ).toHaveAttribute("href", `/${locale}/premium`);
    await signIn(page);
    await page.goto(`/${locale}/account/profile`);
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Premium", exact: true }),
    ).toBeVisible();
    await page
      .locator("header")
      .getByRole("link", { name: "Premium", exact: true })
      .click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
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
      path: info.outputPath(`plans-${locale}.png`),
      fullPage: true,
    });
    const prisma = testPrisma();
    try {
      await prisma.premiumGrant.create({
        data: {
          userId: "e2e-member",
          startsAt: new Date(),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    } finally {
      await prisma.$disconnect();
    }
    await page.reload();
    await expect(
      page
        .locator("header")
        .getByRole("link", { name: "Premium", exact: true }),
    ).toHaveCount(0);
  });
}
