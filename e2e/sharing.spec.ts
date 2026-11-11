import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { testEnvironment, testOrigin } from "./environment";
import { accounts, newAccount, resetFixtures, testPrisma } from "./seed";

const listUrl = "/en/lists/e2e-collaboration";
const sharingUrl = `${listUrl}/sharing`;
const title = "Private family wishlist";

const signIn = async (
  page: Page,
  account = accounts.owner,
  destination?: string,
) => {
  await page.goto(destination ?? "/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(destination ?? /\/lists$/);
};

const latestMail = async () =>
  (await (
    await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/message/latest`)
  ).json()) as { Text: string; HTML: string };

const invite = async (
  page: Page,
  email = accounts.member.email,
  role = "MEMBER",
) => {
  await page.goto(sharingUrl);
  await page
    .getByRole("textbox", { name: "Invitation email", exact: true })
    .fill(email);
  await page.getByLabel("Invitation role").selectOption(role);
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Invitation created");
  await expect(page.getByText("Email sent", { exact: false })).toBeVisible();
  const message = await latestMail();
  expect(message.Text).not.toContain(title);
  expect(message.Text).not.toContain("Secret gift");
  return message.Text.match(
    /https?:\/\/[^\s]+\/invitations\/[a-zA-Z0-9_-]+/,
  )![0];
};

const join = async (page: Page, locale: "en" | "fi" = "en") => {
  await page
    .getByRole("checkbox", {
      name:
        locale === "fi" ? /Hyväksyn tämän kutsun/ : /I accept this invitation/,
    })
    .check();
  await page
    .getByRole("button", {
      name: locale === "fi" ? "Hyväksy kutsu" : "Accept invitation",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/lists\?shared=1/);
  await expect(
    page.getByRole("status", {
      name: locale === "fi" ? "Tallennusvahvistus" : "Save confirmation",
    }),
  ).toContainText(locale === "fi" ? "Kutsu hyväksytty" : "Invitation accepted");
};

const memberCard = (page: Page, username: string) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: new RegExp(`^${username}( You)?$`),
    }),
  });
const confirmAction = async (scope: Locator, button: string) => {
  const actionName = scope.page().getByRole("button", {
    name: button,
    exact: true,
    includeHidden: true,
  });
  const action = scope.getByRole("button", {
    name: button,
    exact: true,
    includeHidden: true,
  });
  while (!(await action.isVisible())) {
    await scope
      .locator("details:not([open])")
      .filter({ has: actionName })
      .first()
      .locator(":scope > summary")
      .click();
  }
  const form = scope.locator("form").filter({ has: actionName });
  await expect(action).toBeDisabled();
  await form.getByRole("checkbox").check();
  await expect(action).toBeEnabled();
  await form.getByRole("button", { name: button, exact: true }).click();
};

test.beforeEach(async () => {
  await resetFixtures();
  await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
  });
  const prisma = testPrisma();
  try {
    await prisma.premiumGrant.create({
      data: {
        userId: "e2e-owner",
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await prisma.wishlist.create({
      data: {
        id: "e2e-collaboration",
        title,
        ownerId: "e2e-owner",
        visibility: "PRIVATE",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: "e2e-collaboration-wish",
            title: "Secret gift",
            authorId: "e2e-owner",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("private creation, email invitation, member access, reservation and removal", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Create a list", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("New private draft");
  await page
    .getByRole("radio", { name: "Selected people", exact: true })
    .check();
  await page.getByLabel("Title", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page.getByText("Enter a title", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Selected people", exact: true }),
  ).toBeChecked();
  await page.getByLabel("Title", { exact: true }).fill("New private draft");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "New private draft", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Visible · Private list", { exact: true }),
  ).toBeVisible();
  const invitation = await invite(page);
  const other = await browser.newPage({ baseURL: testOrigin });
  try {
    expect(await (await request.get(listUrl)).text()).not.toContain(title);
    await signIn(other, accounts.member, invitation);
    await expect(
      other.getByRole("button", { name: "Accept invitation" }),
    ).toBeVisible();
    await expect(other.getByText(title, { exact: true })).toHaveCount(0);
    await join(other);
    await other.getByRole("link", { name: title, exact: true }).click();
    await expect(
      other.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      other.getByRole("link", { name: "List settings", exact: true }),
    ).toHaveCount(0);
    await other.goto(`${listUrl}/wishes/e2e-collaboration-wish`);
    await other
      .getByRole("button", { name: "Reserve wish", exact: true })
      .click();
    await expect(
      other.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
    await page.reload();
    await confirmAction(memberCard(page, "e2e-member"), "Remove member");
    await expect(
      page.getByRole("status", { name: "Save confirmation" }),
    ).toContainText("Member removed");
    await other.reload();
    await expect(
      other.getByRole("heading", { name: "Secret gift", exact: true }),
    ).toHaveCount(0);
    await other.goto("/en/reservations");
    await expect(
      other.getByRole("link", { name: "Secret gift", exact: true }),
    ).toHaveCount(0);
    await other.goto(invitation);
    await expect(
      other.getByText(/This invitation is unavailable/),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("new invitees register and verify the intended email, then explicitly join", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const invitation = await invite(page, newAccount.email);
  const other = await browser.newPage({ baseURL: testOrigin });
  try {
    await other.goto(invitation);
    await other
      .getByRole("link", { name: "Create an account", exact: true })
      .click();
    await other
      .getByLabel("Username", { exact: true })
      .fill(newAccount.username);
    await other.getByLabel("Email", { exact: true }).fill(newAccount.email);
    await other
      .getByLabel("Password", { exact: true })
      .fill(newAccount.password);
    await other
      .getByLabel("Confirm password", { exact: true })
      .fill(newAccount.password);
    await other
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(other).toHaveURL(/\/email-verification\?returnTo=/);
    await other
      .getByLabel("Verification code")
      .fill((await latestMail()).Text.match(/\b[A-Z]{8}\b/)![0]);
    await other
      .getByRole("button", { name: "Verify email", exact: true })
      .click();
    await expect(other).toHaveURL(invitation);
    await expect(
      other.getByRole("button", { name: "Accept invitation", exact: true }),
    ).toBeVisible();
    await join(other);
    await expect(
      other.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("wrong accounts cannot inspect invitations; revocation invalidates an open acceptance form", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const invitation = await invite(page);
  const other = await browser.newPage({ baseURL: testOrigin });
  try {
    await signIn(other, accounts.member, invitation);
    await page.goto(invitation);
    await expect(
      page.getByText(/This invitation is unavailable/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Accept invitation", exact: true }),
    ).toHaveCount(0);
    await page.goto(sharingUrl);
    await page
      .getByRole("button", { name: "Cancel invitation", exact: true })
      .click();
    await expect(
      page.getByText("No pending invitations. Send one above to get started."),
    ).toBeVisible();
    await other
      .getByRole("checkbox", { name: /I accept this invitation/ })
      .check();
    await other
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(other.getByRole("main").getByRole("alert")).toContainText(
      "unavailable",
    );
    await expect(other.getByRole("main").getByRole("alert")).toBeFocused();
  } finally {
    await other.close();
  }
});

test("admin promotion, owner transfer and leaving use current ownership and Premium", async ({
  page,
  browser,
}, info) => {
  await signIn(page);
  const invitation = await invite(page);
  const other = await browser.newPage({ baseURL: testOrigin });
  try {
    await signIn(other, accounts.member, invitation);
    await join(other);
    await page.reload();
    await confirmAction(memberCard(page, "e2e-member"), "Make admin");
    await expect(
      memberCard(page, "e2e-member").getByRole("button", {
        name: "Make member",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("sharing-members.png"),
      fullPage: true,
      scale: "css",
    });
    await other.goto(sharingUrl);
    await expect(
      other.getByRole("button", { name: "Transfer ownership", exact: true }),
    ).toHaveCount(0);
    await expect(
      other.getByRole("button", { name: "Send invitation", exact: true }),
    ).toBeVisible();
    await confirmAction(memberCard(page, "e2e-member"), "Transfer ownership");
    await expect(memberCard(page, "e2e-member")).toContainText("Owner · Admin");
    await expect(
      page.getByRole("button", { name: "Send invitation", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText(/The owner needs Premium/)).toBeVisible();
    await other.reload();
    await expect(
      memberCard(other, "e2e-member").getByRole("button", {
        name: "Leave list",
        exact: true,
      }),
    ).toHaveCount(0);
    await confirmAction(memberCard(page, "e2e-owner"), "Leave list");
    await expect(page).toHaveURL(/\/lists\?shared=1/);
    await page.goto(listUrl);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(0);
    await other.goto(listUrl);
    await expect(
      other.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("Premium expiry rejects stale invitations and admin forms while existing membership remains", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const invitation = await invite(page, accounts.member.email, "ADMIN");
  const other = await browser.newPage({ baseURL: testOrigin });
  const prisma = testPrisma();
  try {
    await signIn(other, accounts.member, invitation);
    await prisma.premiumGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await other
      .getByRole("checkbox", { name: /I accept this invitation/ })
      .check();
    await other
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(other.getByRole("main").getByRole("alert")).toContainText(
      "Active Premium",
    );
    await page
      .getByRole("textbox", { name: "Invitation email", exact: true })
      .fill("another@example.test");
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Active Premium",
    );
    await prisma.premiumGrant.updateMany({
      data: { expiresAt: new Date(Date.now() + 86400000) },
    });
    await other.reload();
    await join(other);
    await other.goto(sharingUrl);
    await prisma.membership.updateMany({
      where: { wishlistId: "e2e-collaboration", userId: "e2e-member" },
      data: { role: "MEMBER" },
    });
    await other
      .getByRole("textbox", { name: "Invitation email", exact: true })
      .fill("spoof@example.test");
    await other
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(other.getByRole("main").getByRole("alert")).toContainText(
      "permission",
    );
    await prisma.premiumGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await other.goto(listUrl);
    await expect(
      other.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  } finally {
    await prisma.$disconnect();
    await other.close();
  }
});

test("sharing and visibility controls support keyboard use at 320px in dark mode", async ({
  page,
  request,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto(sharingUrl);
  await page
    .getByRole("textbox", { name: "Invitation email", exact: true })
    .fill("long-recipient-address-for-layout@example.test");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Invitation created");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("sharing-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  const audience = page.getByRole("region", {
    name: "Who can view this list?",
    exact: true,
  });
  await audience.getByRole("radio", { name: "Anyone", exact: true }).check();
  await audience.getByRole("checkbox").check();
  await audience
    .getByRole("button", { name: "Save audience", exact: true })
    .click();
  await expect(
    audience.getByRole("radio", { name: "Anyone", exact: true }),
  ).toBeChecked();
  await expect(audience.locator('button[type="submit"]')).toHaveCount(0);
  expect(await (await request.get(listUrl)).text()).toContain(title);
  await audience
    .getByRole("radio", { name: "Selected people", exact: true })
    .check();
  await audience.getByRole("checkbox").check();
  await audience
    .getByRole("button", { name: "Save audience", exact: true })
    .click();
  await expect(audience.locator('button[type="submit"]')).toHaveCount(0);
  expect(await (await request.get(listUrl)).text()).not.toContain(title);
});

test("sharing separates account and guest access and keeps member controls collapsed", async ({
  page,
}, info) => {
  const prisma = testPrisma();
  try {
    await prisma.membership.create({
      data: {
        wishlistId: "e2e-collaboration",
        userId: "e2e-member",
        role: "ADMIN",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  await signIn(page);
  await page.goto(sharingUrl);
  await expect(
    page.getByText("Restricted access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Manage guest links", exact: true }),
  ).toBeVisible();
  const card = memberCard(page, "e2e-member");
  await expect(
    card.getByRole("button", { name: "Remove member", includeHidden: true }),
  ).toBeHidden();
  await page.screenshot({
    path: info.outputPath("sharing-overview.png"),
    fullPage: true,
  });
  await card.locator("summary").filter({ hasText: "Manage access" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    card.getByRole("button", { name: "Remove member" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", {
      name: "Transfer ownership",
      includeHidden: true,
    }),
  ).toBeHidden();
  await card
    .locator("summary")
    .filter({ hasText: "Transfer ownership" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    card.getByRole("button", { name: "Transfer ownership" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Manage guest links", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest links", exact: true }),
  ).toBeVisible();
});

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: List access opens audience selection and previously invited people can be picked visually`, async ({
    page,
    request,
  }, info) => {
    const db = testPrisma();
    try {
      await db.wishlist.update({
        where: { id: "e2e-collaboration" },
        data: { visibility: "PUBLIC" },
      });
      await db.wishlist.create({
        data: {
          id: "e2e-previous-sharing",
          title: "Previous list",
          ownerId: "e2e-owner",
          memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
          invitations: {
            create: {
              email: accounts.member.email,
              role: "MEMBER",
              inviterId: "e2e-owner",
              acceptedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
            },
          },
        },
      });
    } finally {
      await db.$disconnect();
    }
    await signIn(page);
    await page.goto(`/${locale}/lists/e2e-collaboration`);
    await page
      .getByRole("link", {
        name: locale === "fi" ? "Listan käyttöoikeudet" : "List access",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/lists/e2e-collaboration/sharing$`),
    );
    const audience = page.getByRole("region", {
      name:
        locale === "fi"
          ? "Kuka näkee tämän listan?"
          : "Who can view this list?",
      exact: true,
    });
    const selected = audience.getByRole("radio", {
      name: locale === "fi" ? "Valitut henkilöt" : "Selected people",
      exact: true,
    });
    await selected.focus();
    await page.keyboard.press("Space");
    await expect(selected).toBeChecked();
    // Picking an unsaved audience cannot silently revoke access.
    expect(await (await request.get(listUrl)).text()).toContain(title);
    const save = audience.getByRole("button", {
      name: locale === "fi" ? "Tallenna katseluoikeudet" : "Save audience",
      exact: true,
    });
    await save.click();
    await expect(audience.getByRole("checkbox")).toBeFocused();
    expect(await (await request.get(listUrl)).text()).toContain(title);
    await audience.getByRole("checkbox").check();
    await save.click();
    await expect(audience.locator('button[type="submit"]')).toHaveCount(0);
    await expect(selected).toBeChecked();
    expect(await (await request.get(listUrl)).text()).not.toContain(title);
    const contact = page.getByRole("button", {
      name: `e2e-member ${accounts.member.email}`,
      exact: true,
    });
    await expect(contact).toHaveAttribute("aria-pressed", "false");
    await contact.focus();
    await page.keyboard.press("Enter");
    await expect(contact).toHaveAttribute("aria-pressed", "true");
    const email = page.getByLabel(
      locale === "fi" ? "Kutsuttavan sähköposti" : "Invitation email",
      { exact: true },
    );
    await expect(email).toHaveValue(accounts.member.email);
    await expect(email).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`sharing-picker-${locale}.png`),
      fullPage: true,
    });
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.emulateMedia({ reducedMotion: "reduce" });
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
        (await audience.locator("label > span > span").first().boundingBox())
          ?.width,
      ).toBeGreaterThan(150);
      expect(
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(
          `sharing-${locale}-${dark ? "dark" : "light"}-320-200.png`,
        ),
        fullPage: true,
      });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page
      .getByRole("button", {
        name: locale === "fi" ? "Lähetä kutsu" : "Send invitation",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      locale === "fi" ? "Kutsu luotu" : "Invitation created",
    );
    await expect(email).toHaveValue("");
    await expect(contact).toHaveCount(0);
    const invitations = page.getByRole("region", {
      name: locale === "fi" ? "Avoimet kutsut" : "Pending invitations",
      exact: true,
    });
    await expect(
      invitations.getByRole("heading", {
        name: accounts.member.email,
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("public lists keep the Premium gate visible and active guest links are counted explicitly", async ({
  page,
}) => {
  const db = testPrisma();
  try {
    await db.wishlist.update({
      where: { id: "e2e-collaboration" },
      data: { visibility: "PUBLIC" },
    });
    await db.premiumGrant.deleteMany({ where: { userId: "e2e-owner" } });
    await db.guestLink.createMany({
      data: [
        {
          wishlistId: "e2e-collaboration",
          label: "Active link",
          tokenHash: "a".repeat(64),
          expiresAt: new Date(Date.now() + 86400000),
        },
        {
          wishlistId: "e2e-collaboration",
          label: "Expired link",
          createdAt: new Date(Date.now() - 2 * 86400000),
          tokenHash: "b".repeat(64),
          expiresAt: new Date(Date.now() - 86400000),
        },
        {
          wishlistId: "e2e-collaboration",
          label: "Revoked link",
          tokenHash: "c".repeat(64),
          expiresAt: new Date(Date.now() + 86400000),
          revokedAt: new Date(),
        },
      ],
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page);
  await page.goto(sharingUrl);
  await expect(
    page.getByRole("radio", { name: "Selected people", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send invitation", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Active guest links: 1\./)).toBeVisible();
  await page
    .getByRole("link", { name: "Review or disable guest links", exact: true })
    .click();
  await expect(page).toHaveURL(/\/guest-links$/);
});

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: favorites are recommended first and invitations never expose their email`, async ({
    page,
  }, info) => {
    const db = testPrisma();
    try {
      await db.user.update({
        where: { id: "e2e-member" },
        data: { name: "Favorite Friend" },
      });
      await db.wishlist.update({
        where: { id: "e2e-private-list" },
        data: { visibility: "PUBLIC", publication: "PUBLISHED" },
      });
      await db.favoritePerson.create({
        data: { userId: "e2e-owner", personId: "e2e-member" },
      });
    } finally {
      await db.$disconnect();
    }
    await signIn(page);
    await page.goto(`/${locale}/lists/e2e-collaboration/sharing`);
    const favorite = page.getByRole("button", {
      name: "Favorite Friend @e2e-member",
      exact: true,
    });
    const favorites = page.getByRole("group", {
      name: locale === "fi" ? "Suosikeistasi" : "From your favorites",
    });
    await expect(favorites).toContainText("Favorite Friend");
    expect(await page.content()).not.toContain(accounts.member.email);
    await favorite.focus();
    await page.keyboard.press("Enter");
    await expect(favorite).toHaveAttribute("aria-pressed", "true");
    const email = page.getByLabel(
      locale === "fi" ? "Tai kutsu sähköpostitse" : "Or invite by email",
      { exact: true },
    );
    await expect(email).toHaveValue("");
    await expect(email).not.toHaveAttribute("required");
    // Typing an address replaces the selected account, never sends to both.
    await email.fill("someone@example.test");
    await expect(favorite).toHaveAttribute("aria-pressed", "false");
    await expect(email).toHaveAttribute("required");
    await favorite.click();
    await expect(email).toHaveValue("");
    await page
      .getByRole("region", {
        name: locale === "fi" ? "Kutsu henkilöitä" : "Invite people",
        exact: true,
      })
      .screenshot({ path: info.outputPath(`favorites-picker-${locale}.png`) });
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.emulateMedia({ reducedMotion: "reduce" });
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
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(
          `favorites-${locale}-${dark ? "dark" : "light"}.png`,
        ),
        fullPage: true,
      });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page
      .getByRole("button", {
        name: locale === "fi" ? "Lähetä kutsu" : "Send invitation",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      locale === "fi" ? "Kutsu luotu" : "Invitation created",
    );
    await expect(favorite).toHaveCount(0);
    const pending = page.getByRole("region", {
      name: locale === "fi" ? "Avoimet kutsut" : "Pending invitations",
      exact: true,
    });
    await expect(
      pending.getByRole("heading", { name: "Favorite Friend", exact: true }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(accounts.member.email);
    await page.reload();
    expect(await page.content()).not.toContain(accounts.member.email);
    const message = await latestMail();
    const invitationUrl = message.Text.match(
      /https?:\/\/[^\s]+\/invitations\/[a-zA-Z0-9_-]+/,
    )![0];
    await page.context().clearCookies();
    await signIn(page, accounts.member);
    const localizedInvitation = new URL(invitationUrl);
    localizedInvitation.pathname = localizedInvitation.pathname.replace(
      /^\/(en|fi)\//,
      `/${locale}/`,
    );
    await page.goto(localizedInvitation.href);
    await join(page, locale);
    await page.goto(listUrl);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  });
}

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: list settings keep navigation compact and editing controls separate`, async ({
    page,
  }, info) => {
    await signIn(page);
    await page.goto(`/${locale}/lists/e2e-collaboration/edit`);
    const headings = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(headings.first()).toHaveText(
      locale === "fi" ? "Tiedot ja varaukset" : "Details and reservations",
    );
    await expect(headings.last()).toHaveText(
      locale === "fi" ? "Poista lista" : "Delete list",
    );
    const manage = page.getByRole("link", {
      name: locale === "fi" ? "Listan käyttöoikeudet" : "List access",
      exact: true,
    });
    await expect(
      page.getByRole("button", {
        name: /^(Hide list|Publish list|Piilota lista|Julkaise lista)$/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^(QR card|QR-kortti)$/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^(Download QR card|Lataa QR-kortti)$/ }),
    ).toHaveCount(0);
    const settingsBounds = await page
      .getByRole("main")
      .locator("header")
      .boundingBox();
    await expect(manage).toHaveAttribute(
      "href",
      `/${locale}/lists/e2e-collaboration/sharing`,
    );
    await page.screenshot({
      path: info.outputPath(`settings-${locale}.png`),
      fullPage: true,
    });
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.emulateMedia({ reducedMotion: "reduce" });
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
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await manage.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "fi" ? "Listan käyttöoikeudet" : "List access",
    );
    const header = page.getByRole("main").locator("header");
    if (info.project.name !== "mobile-chromium") {
      const accessBounds = await header.boundingBox();
      expect(Math.abs(accessBounds!.x - settingsBounds!.x)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(accessBounds!.width - settingsBounds!.width),
      ).toBeLessThanOrEqual(1);
    }
    const roles = page.locator("details").filter({
      has: page.locator("summary").filter({
        hasText:
          locale === "fi"
            ? "Roolit ja omistajuus"
            : "About roles and ownership",
      }),
    });
    const summary = roles.locator(":scope > summary");
    expect(
      (await roles.boundingBox())!.height -
        (await summary.boundingBox())!.height,
    ).toBeLessThanOrEqual(16);
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(roles).toHaveAttribute("open", "");
    await expect(roles.locator("p").first()).toBeVisible();
    await page.keyboard.press("Space");
    await expect(roles).not.toHaveAttribute("open");
    const guest = page.getByRole("region", {
      name: locale === "fi" ? "Vieraslinkit" : "Guest links",
      exact: true,
    });
    await expect(
      guest.getByRole("link", {
        name:
          locale === "fi" ? "Hallitse vieraslinkkejä" : "Manage guest links",
        exact: true,
      }),
    ).toBeVisible();
    expect(await guest.locator("details").count()).toBe(0);
    await page.screenshot({
      path: info.outputPath(`access-refined-${locale}.png`),
      fullPage: true,
    });
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 320, height: 800 });
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
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
      await guest.screenshot({
        path: info.outputPath(
          `guest-${locale}-${dark ? "dark" : "light"}-320-200.png`,
        ),
      });
    }
  });
}
