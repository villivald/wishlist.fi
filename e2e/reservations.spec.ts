import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { testOrigin } from "./environment";
import { expectImageLoaded } from "./image-assertions";
import { openMainNavigation } from "./navigation";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listUrl = "/en/lists/e2e-reservation-list";
const wishUrl = `${listUrl}/wishes/e2e-reservation-wish`;

const signIn = async (page: Page, account = accounts.member) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

const reserve = async (page: Page) => {
  await page.goto(wishUrl);
  await page.getByRole("button", { name: "Reserve wish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel reservation", exact: true }),
  ).toBeVisible();
};

const image = async (page: Page) => {
  await page.goto(`${wishUrl}/edit`);
  const buffer = await sharp({
    create: { width: 600, height: 400, channels: 3, background: "#7898b8" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "notebook.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Image description", { exact: true })
    .fill("A notebook cover");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  const uploaded = page.getByRole("img", { name: "A notebook cover" });
  await expectImageLoaded(uploaded);
  return (await uploaded.getAttribute("src"))!;
};

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: "e2e-reservation-list",
        title: "Birthday gift ideas",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: "e2e-reservation-wish",
            title: "A beautiful notebook",
            authorId: "e2e-owner",
            priceMinor: 1999,
            currency: "EUR",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

for (const locale of ["en", "fi"]) {
  test(`${locale} reservation notification links to the owner's wish without revealing the reserver`, async ({
    page,
    browser,
  }) => {
    const prisma = testPrisma();
    const owner = await browser.newPage({ baseURL: testOrigin });
    try {
      await prisma.user.update({
        where: { id: "e2e-owner" },
        data: { locale },
      });
      await signIn(page);
      await reserve(page);
      const email = await prisma.accountEmail.findFirstOrThrow({
        where: { userId: "e2e-owner", key: { startsWith: "wish-reserved/" } },
      });
      const url = `${testOrigin}/${locale}/lists/e2e-reservation-list/wishes/e2e-reservation-wish`;
      expect(email.recipient).toBe(accounts.owner.email);
      expect(email.text).toContain(url);
      expect(email.text).not.toContain(accounts.member.email);
      expect(email.html).not.toContain("e2e-member");
      await signIn(owner, accounts.owner);
      await owner.goto(url);
      await expect(
        owner.getByRole("heading", {
          name: "A beautiful notebook",
          exact: true,
        }),
      ).toBeVisible();
      await expect(owner.getByRole("main")).toContainText(
        locale === "fi" ? "Varattu" : "Reserved",
      );
      await expect(owner.getByRole("main")).not.toContainText("e2e-member");
      await expect(owner.getByRole("main")).not.toContainText(
        accounts.member.email,
      );
    } finally {
      await owner.close();
      await prisma.$disconnect();
    }
  });
}

test("reserve, view, cancel and admin revoke preserve identity and image privacy", async ({
  page,
  browser,
  request,
}, info) => {
  const owner = await browser.newPage({ baseURL: testOrigin });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(wishUrl);
    await expect(
      page.getByRole("link", { name: "Sign in to reserve" }),
    ).toBeVisible();
    await signIn(owner, accounts.owner);
    const mediaUrl = await image(owner);
    expect((await request.get(mediaUrl)).status()).toBe(200);
    await signIn(page);
    await reserve(page);
    await (
      await openMainNavigation(page)
    )
      .getByRole("link", { name: "My reservations", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "My reservations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "A beautiful notebook", exact: true }),
    ).toBeVisible();
    await expectImageLoaded(
      page.getByRole("img", { name: "A notebook cover" }),
    );
    await page.screenshot({
      path: info.outputPath("my-reservations.png"),
      fullPage: true,
      scale: "css",
    });
    expect(
      (
        await request.get(mediaUrl, {
          headers: { "If-None-Match": '"previous"' },
        })
      ).status(),
    ).toBe(404);
    expect(await (await request.get(wishUrl)).text()).not.toContain(
      "A beautiful notebook",
    );
    expect(await (await request.get(listUrl)).text()).not.toContain(
      "A beautiful notebook",
    );
    const ownerResponse = await owner.goto(wishUrl);
    const ownerBody = await ownerResponse!.text();
    expect(ownerBody).not.toContain(accounts.member.email);
    expect(ownerBody).not.toContain("e2e-member");
    await expect(
      owner.getByRole("button", { name: "Revoke reservation", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel reservation", exact: true })
      .click();
    await expect(
      page.getByRole("status", { name: "Save confirmation" }),
    ).toHaveText("Reservation canceled.");
    await expect(
      page.getByRole("heading", { name: "No active reservations" }),
    ).toBeVisible();
    expect((await request.get(mediaUrl)).status()).toBe(200);
    await reserve(page);
    await owner.reload();
    await owner
      .getByRole("button", { name: "Revoke reservation", exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: "Reserve wish", exact: true }),
    ).toBeVisible();
    await page.goto("/en/reservations");
    await expect(
      page.getByRole("heading", { name: "No active reservations" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await owner.close();
  }
});

test("competing browsers get one reservation and clear feedback for the loser", async ({
  page,
  browser,
}) => {
  const owner = await browser.newPage({ baseURL: testOrigin });
  const prisma = testPrisma();
  try {
    await signIn(page);
    await signIn(owner, accounts.owner);
    await page.goto(wishUrl);
    await owner.goto(wishUrl);
    await Promise.all([
      page.getByRole("button", { name: "Reserve wish", exact: true }).click(),
      owner.getByRole("button", { name: "Reserve wish", exact: true }).click(),
    ]);
    await expect
      .poll(() =>
        prisma.reservation.count({
          where: { wishId: "e2e-reservation-wish", endedAt: null },
        }),
      )
      .toBe(1);
    const active = await prisma.reservation.findFirstOrThrow({
      where: { wishId: "e2e-reservation-wish", endedAt: null },
    });
    const winner = active.userId === "e2e-owner" ? owner : page;
    const loser = active.userId === "e2e-owner" ? page : owner;
    await expect(
      winner.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
    const feedback = loser.getByRole("main").getByRole("alert");
    await expect(feedback).toContainText("can no longer be reserved");
    await expect(feedback).toBeFocused();
    await loser.goto("/en/reservations");
    await expect(
      loser.getByRole("heading", { name: "No active reservations" }),
    ).toBeVisible();
  } finally {
    await owner.close();
    await prisma.$disconnect();
  }
});

test("disabling preserves reservations, fulfillment ends them, and reopening never restores them", async ({
  page,
  browser,
}, info) => {
  const owner = await browser.newPage({ baseURL: testOrigin });
  try {
    await signIn(page);
    await reserve(page);
    await signIn(owner, accounts.owner);
    const card = owner.getByRole("listitem").filter({
      has: owner.getByRole("heading", { name: "Birthday gift ideas" }),
    });
    await expect(
      card.getByText("0 available wishes", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("1 reserved", { exact: true })).toBeVisible();
    await expect(
      card.getByText("Reservations enabled", { exact: true }),
    ).toBeVisible();
    await owner.goto(`${listUrl}/edit`);
    await owner.getByLabel("Allow reservations").uncheck();
    await owner
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(owner.getByRole("status")).toContainText("Changes saved.");
    await expect(owner).toHaveURL(`${listUrl}/edit`);
    await owner.goto("/fi/lists");
    await expect(
      card.getByText("0 vapaata toivetta", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("1 varattuna", { exact: true })).toBeVisible();
    await expect(
      card.getByText("Varaukset pois käytöstä", { exact: true }),
    ).toBeVisible();
    await owner.screenshot({
      path: info.outputPath("finnish-list-counts.png"),
      fullPage: true,
      scale: "css",
    });
    await page.goto("/en/reservations");
    await page
      .getByRole("link", { name: "A beautiful notebook", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
    await owner.goto(wishUrl);
    await owner.getByRole("button", { name: "Mark as fulfilled" }).click();
    await expect(
      owner.getByRole("button", { name: "Reopen wish" }),
    ).toBeVisible();
    await page.goto("/en/reservations");
    await expect(
      page.getByRole("heading", { name: "No active reservations" }),
    ).toBeVisible();
    await owner.getByRole("button", { name: "Reopen wish" }).click();
    await expect(
      owner.getByRole("button", { name: "Mark as fulfilled" }),
    ).toBeVisible();
    await expect(
      owner.getByRole("button", { name: "Reserve wish", exact: true }),
    ).toHaveCount(0);
    await owner.goto("/en/lists");
    await expect(
      card.getByText("1 available wish", { exact: true }),
    ).toBeVisible();
    await expect(card.getByText("0 reserved", { exact: true })).toHaveCount(0);
    await page.goto(wishUrl);
    await expect(page.getByRole("main")).toContainText(
      "Reservations are not available",
    );
  } finally {
    await owner.close();
  }
});

test("private access removal clears reservations and rejects a stale reserve form", async ({
  page,
}) => {
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: "e2e-reservation-list" },
      data: { visibility: "PRIVATE" },
    });
    await prisma.membership.create({
      data: { wishlistId: "e2e-reservation-list", userId: "e2e-member" },
    });
    await signIn(page);
    await reserve(page);
    await page.goto("/en/reservations");
    await expect(
      page.getByRole("link", { name: "A beautiful notebook", exact: true }),
    ).toBeVisible();
    await prisma.membership.delete({
      where: {
        wishlistId_userId: {
          wishlistId: "e2e-reservation-list",
          userId: "e2e-member",
        },
      },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "No active reservations" }),
    ).toBeVisible();
    await page.goto(wishUrl);
    await expect(
      page.getByRole("heading", { name: "Page not found" }),
    ).toBeVisible();
    await prisma.membership.create({
      data: { wishlistId: "e2e-reservation-list", userId: "e2e-member" },
    });
    await page.goto(wishUrl);
    await expect(
      page.getByRole("button", { name: "Reserve wish", exact: true }),
    ).toBeVisible();
    await prisma.membership.delete({
      where: {
        wishlistId_userId: {
          wishlistId: "e2e-reservation-list",
          userId: "e2e-member",
        },
      },
    });
    await page
      .getByRole("button", { name: "Reserve wish", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "can no longer be reserved",
    );
    expect(
      await prisma.reservation.count({
        where: { wishId: "e2e-reservation-wish", endedAt: null },
      }),
    ).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("owner self-reservation supports keyboard use and a 320px dark layout", async ({
  page,
}, info) => {
  await signIn(page, accounts.owner);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(wishUrl);
  const button = page.getByRole("button", {
    name: "Reserve wish",
    exact: true,
  });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Cancel reservation", exact: true }),
  ).toBeVisible();
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "My reservations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My reservations", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("reservations-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No active reservations" }),
  ).toBeVisible();
});
