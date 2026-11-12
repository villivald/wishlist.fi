import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { testEnvironment, testOrigin } from "./environment";
import { expectImageLoaded } from "./image-assertions";
import { openMainNavigation } from "./navigation";
import { accounts, newAccount, resetFixtures, testPrisma } from "./seed";

const signIn = async (page: Page, account = accounts.owner) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

const confirmDeletion = async (
  page: Page,
  password = accounts.owner.password,
) => {
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
};

const seedList = async (successor = false) => {
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: "e2e-account-list",
        title: "Shared birthday gifts",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        memberships: {
          create: [
            { userId: "e2e-owner", role: "ADMIN" },
            ...(successor
              ? [{ userId: "e2e-member", role: "ADMIN" as const }]
              : []),
          ],
        },
        wishes: {
          create: {
            id: "e2e-account-wish",
            title: "A garden book",
            authorId: "e2e-owner",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
};

test.beforeEach(resetFixtures);

test("profile details validate, preserve invalid input, save, clear, and stay undiscoverable without a public list", async ({
  page,
  request,
}, info) => {
  await signIn(page);
  await openMainNavigation(page);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByLabel("Display name").fill("Ada Müller");
  await page
    .getByLabel("About you")
    .fill(
      "Private profile marker <script>alert(1)</script>\nGardens and books.",
    );
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Ada Müller");
  await expect(page.getByLabel("About you")).toHaveValue(
    /Private profile marker/,
  );
  await page
    .getByLabel("Display name")
    .evaluate((input) => input.removeAttribute("maxlength"));
  await page.getByLabel("Display name").fill("x".repeat(81));
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByText("Use at most 80 characters")).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveValue("x".repeat(81));
  await expect(page.getByLabel("About you")).toHaveValue(
    /Private profile marker/,
  );
  expect(
    await (await request.get("/en/browse?view=users")).text(),
  ).not.toContain("Private profile marker");
  await page.screenshot({
    path: info.outputPath("account-profile.png"),
    fullPage: true,
    scale: "css",
  });
  await page.getByLabel("Display name").fill("");
  await page.getByLabel("About you").fill("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("");
  await expect(page.getByLabel("About you")).toHaveValue("");
});

test("username changes are explicit, validate duplicates, and preserve email sign-in", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/en/account/profile");
  const username = page.getByLabel("Username", { exact: true });
  await expect(username).toHaveValue("e2e-owner");
  await username.fill("e2e-member");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByText("This username is taken. Choose another."),
  ).toBeVisible();
  await expect(username).toHaveValue("e2e-member");
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: /Use email suggestion/ }).click();
  await expect(username).toBeFocused();
  await expect(username).toHaveValue("owner");
  await page.reload();
  await expect(username).toHaveValue("e2e-owner");
  await username.fill("readable-owner");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  await expect(
    page.locator("dd").getByText("readable-owner", { exact: true }),
  ).toBeVisible();
  await page.context().clearCookies();
  await signIn(page);
  await page.goto("/en/account/profile");
  await expect(username).toHaveValue("readable-owner");
});

test("register, create a visible list, reserve, cancel, fulfill and delete without a successor", async ({
  page,
  browser,
  request,
}) => {
  await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
  });
  await page.goto("/en/sign-up");
  await page.getByLabel("Username", { exact: true }).fill(newAccount.username);
  await page.getByLabel("Email", { exact: true }).fill(newAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(newAccount.password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(newAccount.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/email-verification$/);
  const message = (await (
    await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/message/latest`)
  ).json()) as { Text: string };
  await page
    .getByLabel("Verification code")
    .fill(message.Text.match(/\b[A-Z]{8}\b/)![0]);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  const other = await browser.newPage({ baseURL: testOrigin });
  let listId: string | undefined;
  try {
    await signIn(other, newAccount);
    await page
      .getByRole("link", { name: "Create a list", exact: true })
      .click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("My free account journey");
    await page.getByLabel("Allow reservations").check();
    await page
      .getByRole("button", { name: "Create list", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "My free account journey",
        exact: true,
      }),
    ).toBeVisible();
    listId = new URL(page.url()).pathname.split("/").at(-1);
    await page
      .getByRole("link", { name: "List settings", exact: true })
      .click();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to list", exact: true }).click();
    await page.getByRole("link", { name: "Add a wish", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("A free account wish");
    await page.getByRole("button", { name: "Add wish", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "A free account wish", exact: true }),
    ).toBeVisible();
    const wishUrl = new URL(page.url()).pathname;
    await page
      .getByRole("button", { name: "Reserve wish", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel reservation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "My reservations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Save confirmation" }),
    ).toHaveText("Reservation canceled.");
    await page.goto(wishUrl);
    await expect(
      page.getByRole("button", { name: "Reserve wish", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mark as fulfilled" }).click();
    await expect(
      page.getByRole("button", { name: "Reopen wish" }),
    ).toBeVisible();
    await openMainNavigation(page);
    await page.getByRole("link", { name: "Account", exact: true }).click();
    const buffer = await sharp({
      create: { width: 80, height: 80, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer });
    await page
      .getByLabel("Image description", { exact: true })
      .fill("Private account avatar");
    await page
      .getByRole("button", { name: "Upload image", exact: true })
      .click();
    const image = page.getByRole("img", { name: "Private account avatar" });
    await expectImageLoaded(image);
    const mediaUrl = (await image.getAttribute("src"))!;
    await page
      .getByRole("link", { name: "Delete account", exact: true })
      .click();
    await expect(page.getByRole("main")).toContainText(
      "Archive; no one can access it",
    );
    await confirmDeletion(page, "wrong-password");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Incorrect current password",
    );
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveValue("");
    await confirmDeletion(page, newAccount.password);
    await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
    await expect(page.getByRole("main")).toContainText(
      "Your account has been deleted.",
    );
    await other.reload();
    await expect(other).toHaveURL(/\/sign-in$/);
    expect((await request.get(mediaUrl)).status()).toBe(404);
    expect(await (await request.get(wishUrl)).text()).not.toContain(
      "A free account wish",
    );
    expect(
      await (await request.get(`/en/lists/${listId}`)).text(),
    ).not.toContain("My free account journey");
    const prisma = testPrisma();
    try {
      expect(
        await prisma.user.findUnique({ where: { email: newAccount.email } }),
      ).toBeNull();
      expect(
        await prisma.wishlist.findUnique({ where: { id: listId } }),
      ).toMatchObject({ ownerId: null, archivedAt: expect.any(Date) });
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await other.close();
    if (listId) {
      const prisma = testPrisma();
      try {
        await prisma.wishlist.deleteMany({ where: { id: listId } });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});

test("deleting an owner transfers the list and preserves another admin's reservation", async ({
  page,
  browser,
}) => {
  await seedList(true);
  await signIn(page);
  const member = await browser.newPage({ baseURL: testOrigin });
  try {
    await signIn(member, accounts.member);
    await member.goto("/en/lists/e2e-account-list/wishes/e2e-account-wish");
    await member
      .getByRole("button", { name: "Reserve wish", exact: true })
      .click();
    await expect(
      member.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
    await page.goto("/en/account/delete");
    await expect(page.getByRole("main")).toContainText(
      "Transfer to e2e-member",
    );
    await confirmDeletion(page);
    await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
    await member.goto("/en/lists");
    await expect(
      member.getByRole("link", { name: "Shared birthday gifts", exact: true }),
    ).toBeVisible();
    await member.goto("/en/reservations");
    await expect(
      member.getByRole("link", { name: "A garden book", exact: true }),
    ).toBeVisible();
    await member
      .getByRole("link", { name: "A garden book", exact: true })
      .click();
    await expect(
      member.getByRole("link", { name: "Edit wish", exact: true }),
    ).toBeVisible();
    await expect(
      member.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
  } finally {
    await member.close();
  }
});

test("stale deletion summaries require review, and keeping the account leaves it intact", async ({
  page,
}) => {
  await seedList();
  await signIn(page);
  await page.goto("/en/account/delete");
  const prisma = testPrisma();
  try {
    await prisma.membership.create({
      data: {
        userId: "e2e-member",
        wishlistId: "e2e-account-list",
        role: "ADMIN",
      },
    });
    await confirmDeletion(page);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "review the updated summary",
    );
    await page.getByRole("link", { name: "Refresh deletion summary" }).click();
    await expect(page.getByRole("main")).toContainText(
      "Transfer to e2e-member",
    );
    await page.getByRole("link", { name: "Keep my account" }).click();
    await expect(page).toHaveURL(/\/account\/profile$/);
    expect(await prisma.user.count({ where: { id: "e2e-owner" } })).toBe(1);
  } finally {
    await prisma.$disconnect();
  }
});

test("a revoked session cannot submit an already open deletion form", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/en/account/delete");
  const prisma = testPrisma();
  try {
    await prisma.session.deleteMany({ where: { userId: "e2e-owner" } });
    await confirmDeletion(page);
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await prisma.user.count({ where: { id: "e2e-owner" } })).toBe(1);
  } finally {
    await prisma.$disconnect();
  }
});

test("duplicate registration gives neutral feedback without changing an existing account", async ({
  page,
}) => {
  await page.goto("/en/sign-up");
  await page
    .getByLabel("Username", { exact: true })
    .fill("new-available-username");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(newAccount.password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(newAccount.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Unable to register with these details. Try signing in or recovering your password.",
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await signIn(page);
});

test("profile and deletion work with a keyboard in a 320px dark layout", async ({
  page,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/en/account/profile");
  await page.getByLabel("Display name").fill("Keyboard profile");
  await page.getByRole("button", { name: "Save profile" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Profile saved.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("profile-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("link", { name: "Delete account", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("delete-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByLabel("Current password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
});
