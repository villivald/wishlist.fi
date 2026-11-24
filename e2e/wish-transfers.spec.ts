import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { accounts, resetFixtures, testPrisma } from "./seed";

const sourcePath = "/lists/e2e-transfer-source/wishes/e2e-transfer-wish";

const signIn = async (page: Page, account = accounts.owner) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: "e2e-transfer-source",
        title: "Birthday ideas",
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: "e2e-transfer-wish",
            title: "A travel guide",
            description: "With a map",
            authorId: "e2e-owner",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("a viewer can copy a wish to an owned list and still open the original", async ({
  page,
}) => {
  const listUrl = "/en/lists/e2e-transfer-source?from=browse";
  const cardCopy = page.getByRole("link", {
    name: "Copy A travel guide to my lists",
    exact: true,
  });
  await page.goto(listUrl);
  await expect(
    page.getByRole("heading", { name: "A travel guide" }),
  ).toBeVisible();
  await expect(cardCopy).toHaveCount(0);
  await signIn(page, accounts.member);
  await page.goto(listUrl);
  await expect(page.getByRole("link", { name: "Move wish" })).toHaveCount(0);
  await cardCopy.click();
  await expect(page.getByRole("heading", { name: "Copy wish" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(`/en${sourcePath}?from=browse`);
  await page.getByRole("link", { name: "Copy wish", exact: true }).click();

  const destination = page.getByRole("checkbox", {
    name: /Invited people · Private/,
  });
  await expect(destination).toHaveCount(1);
  await destination.check();
  await page.getByRole("button", { name: "Copy wish", exact: true }).click();
  await expect(page).toHaveURL(/\/lists\/e2e-private-list\/wishes\/copy_/);
  await expect(
    page.getByRole("heading", { name: "A travel guide" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").getByText("Wish copied."),
  ).toBeVisible();
  await expect(page.getByText("With a map")).toBeVisible();
  await page.goto(`/en${sourcePath}`);
  await expect(
    page.getByRole("heading", { name: "A travel guide" }),
  ).toBeVisible();
});

test("move shows eligible lists and moves the wish to its new URL", async ({
  page,
  browserName,
}) => {
  await signIn(page);
  await page.goto(`/en${sourcePath}`);
  await page.getByRole("link", { name: "Move wish", exact: true }).click();
  await expect(
    page.getByText("You need another list you manage to move this wish."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a list", exact: true }),
  ).toBeVisible();

  const prisma = testPrisma();
  try {
    await prisma.membership.create({
      data: {
        wishlistId: "e2e-private-list",
        userId: "e2e-owner",
        role: "ADMIN",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  await page.reload();
  const destination = page.getByRole("radio", {
    name: /Invited people · Private/,
  });
  await expect(destination).toHaveCount(1);
  await destination.check();
  const tab =
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab";
  await destination.press(tab);
  const submit = page.getByRole("button", { name: "Move wish", exact: true });
  await expect(submit).toBeFocused();
  await submit.press("Enter");
  await expect(page).toHaveURL(
    /\/lists\/e2e-private-list\/wishes\/e2e-transfer-wish/,
  );
  await expect(page.getByRole("status").getByText("Wish moved.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A travel guide" }),
  ).toBeVisible();
  await page.goto(`/en${sourcePath}`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("the bilingual destination picker fits at 320px with enlarged text", async ({
  page,
}) => {
  await signIn(page, accounts.member);
  await page.setViewportSize({ width: 320, height: 780 });

  for (const [locale, colorScheme, title, label] of [
    ["en", "light", "Copy wish", "Choose one or more lists"],
    ["fi", "dark", "Kopioi toive", "Valitse yksi tai useampi lista"],
  ] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto(`/${locale}${sourcePath}/copy`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("group", { name: label })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
  }
});

test("copy to two lists confirms the count on the original wish", async ({
  page,
}) => {
  const db = testPrisma();
  try {
    await db.wishlist.create({
      data: {
        title: "Travel",
        ownerId: "e2e-member",
        memberships: { create: { userId: "e2e-member", role: "ADMIN" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page, accounts.member);
  await page.goto(`/en${sourcePath}/copy`);
  const choices = page.getByRole("checkbox");
  await expect(choices).toHaveCount(2);
  for (const choice of await choices.all()) await choice.check();
  await page.getByRole("button", { name: "Copy wish", exact: true }).click();
  await expect(
    page.getByRole("status").getByText("Wish copied to 2 lists."),
  ).toBeVisible();
  await expect(page).toHaveURL(`/en${sourcePath}`);
});

test("wish cards offer the copy picker in Browse, Favorites and My reservations", async ({
  page,
}) => {
  await signIn(page, accounts.member);
  await page.setViewportSize({ width: 320, height: 780 });
  const db = testPrisma();
  try {
    await db.favoriteWish.create({
      data: { userId: "e2e-member", wishId: "e2e-transfer-wish" },
    });
    for (const section of ["browse", "favorites", "reservations"]) {
      if (section === "reservations")
        await db.reservation.create({
          data: { userId: "e2e-member", wishId: "e2e-transfer-wish" },
        });
      await page.goto(
        section === "reservations"
          ? "/fi/reservations"
          : `/fi/${section}?view=wishes`,
      );
      const copy = page.getByRole("link", {
        name: "Kopioi A travel guide omille listoille",
        exact: true,
      });
      await expect(copy).toHaveAttribute(
        "href",
        `/fi${sourcePath}/copy?from=${section}`,
      );
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await expect(copy).toHaveText("");
      await expect(copy).toHaveAttribute("title", "Kopioi toive");
      const bounds = await copy.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
      await copy.click();
      await expect(
        page.getByRole("checkbox", { name: /Another person.s private list/i }),
      ).toBeVisible();
    }
  } finally {
    await db.$disconnect();
  }
});
