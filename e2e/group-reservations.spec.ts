import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { testOrigin } from "./environment";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-group-browser-list";
const wishId = "e2e-group-browser-wish";
const wishPath = `/en/lists/${listId}/wishes/${wishId}`;
const signIn = async (page: Page, account = accounts.owner) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};
const start = async (page: Page) => {
  await page.goto(wishPath);
  await page
    .getByRole("main")
    .getByText("Reserve with others", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Start group reservation", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel(
      "Share my name and username with invitees and people who join this group.",
    )
    .check();
  await page
    .getByRole("button", { name: "Start group reservation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/reservations\/[^/]+$/);
  return new URL(page.url()).pathname;
};
const invite = async (page: Page) => {
  await page.getByLabel("Name or username").fill("e2e-member");
  await page.getByRole("option", { name: /e2e-member/ }).click();
  await page
    .getByRole("button", { name: "Invite e2e-member", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pending invitations", exact: true }),
  ).toBeVisible();
};

test.beforeEach(async () => {
  await resetFixtures();
  const db = testPrisma();
  try {
    await db.wishlist.create({
      data: {
        id: listId,
        title: "A gift together",
        ownerId: "e2e-owner",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        memberships: {
          create: [
            { userId: "e2e-owner", role: "ADMIN" },
            { userId: "e2e-member" },
          ],
        },
        wishes: {
          create: {
            id: wishId,
            title: "Birthday telescope",
            priority: 5,
            priceMinor: 12900,
            currency: "EUR",
            description: "A telescope for stargazing together.",
          },
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test("create, invite, consent, favorites, transfer, leave and cancel a group", async ({
  page,
  browser,
}, info) => {
  const member = await browser.newPage({ baseURL: testOrigin });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  member.on("pageerror", (error) => errors.push(error.message));
  try {
    await signIn(member, accounts.member);
    await member.goto(wishPath);
    await member
      .getByRole("button", {
        name: "Add Birthday telescope to favorites",
        exact: true,
      })
      .click();
    await expect(
      member.getByRole("button", {
        name: "Remove Birthday telescope from favorites",
        exact: true,
      }),
    ).toBeVisible();
    await signIn(page);
    const groupPath = await start(page);
    await invite(page);
    await member.goto("/en/reservations");
    await member
      .getByRole("link", { name: "Review invitation", exact: true })
      .click();
    await expect(
      member.getByRole("heading", { name: "Invitation to join", exact: true }),
    ).toBeVisible();
    await expect(
      member.getByRole("heading", { name: "Group members", exact: true }),
    ).toHaveCount(0);
    await expect(
      member.getByRole("link", { name: "View wish", exact: true }),
    ).toHaveCount(0);
    const accept = member.getByRole("button", {
      name: "Accept invitation",
      exact: true,
    });
    await expect(accept).toBeDisabled();
    await member
      .getByLabel(
        "Share my name and username with the people who join this group.",
      )
      .check();
    await accept.click();
    await expect(
      member.getByRole("heading", { name: "Group members", exact: true }),
    ).toBeVisible();
    await member.goto("/en/favorites?view=wishes");
    await expect(
      member.getByRole("button", {
        name: "Remove Birthday telescope from favorites",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      member.getByText("Reserved by you", { exact: true }),
    ).toBeVisible();
    await page.goto(groupPath);
    await expect(
      page.getByText("2 people have joined, including the organizer."),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("group-organizer.png"),
      fullPage: true,
    });
    await page
      .locator("summary")
      .filter({ hasText: /^Transfer coordination$/ })
      .click();
    await page
      .getByLabel(
        "Make e2e-member the organizer. I will remain a participant. Pending invitations will be canceled.",
      )
      .check();
    await page
      .getByRole("button", { name: "Transfer coordination", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Leave group", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Leave group", exact: true })
      .click();
    await expect(page).toHaveURL(/\/reservations$/);
    await member.goto(groupPath);
    await member
      .getByLabel(
        "End this reservation for everyone and cancel all pending invitations.",
      )
      .check();
    await member
      .getByRole("button", { name: "Cancel group reservation", exact: true })
      .click();
    await expect(member).toHaveURL(/\/reservations$/);
    await member.goto("/en/favorites?view=wishes");
    await expect(
      member.getByRole("button", {
        name: "Remove Birthday telescope from favorites",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      member.getByRole("link", {
        name: "Reserve Birthday telescope",
        exact: true,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await member.close();
  }
});

test("Finnish invitations and group screens support keyboard, mobile reflow and dark mode", async ({
  page,
  browser,
  browserName,
}, info) => {
  const memberContext = await browser.newContext({
    baseURL: testOrigin,
    viewport: { width: 320, height: 800 },
  });
  const member = await memberContext.newPage();
  try {
    await signIn(page);
    const groupPath = await start(page);
    await invite(page);
    await page.goto(groupPath.replace("/en/", "/fi/"));
    await page.setViewportSize({ width: 320, height: 800 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      document.documentElement.classList.add("dark");
    });
    await page.evaluate(() => document.fonts.ready);
    await info.attach("reflow-elements.json", {
      body: JSON.stringify(
        await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter(
              (element) =>
                element.getBoundingClientRect().right > window.innerWidth + 1,
            )
            .map((element) => ({
              tag: element.tagName,
              className: element.className,
              text: element.textContent?.slice(0, 80),
              width: element.getBoundingClientRect().width,
              right: element.getBoundingClientRect().right,
            })),
        ),
      ),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath("group-reflow.png"),
      fullPage: true,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath("group-finnish-320-large.png"),
      fullPage: true,
    });
    await signIn(member, accounts.member);
    await member.goto(groupPath.replace("/en/", "/fi/"));
    await expect(
      member.getByRole("heading", { name: "Liittymiskutsu", exact: true }),
    ).toBeVisible();
    const consent = member.getByLabel(
      "Jaa nimeni ja käyttäjänimeni tähän ryhmään liittyvien henkilöiden kanssa.",
    );
    await consent.focus();
    await member.keyboard.press("Space");
    // Safari's default macOS navigation uses Option-Tab to include buttons.
    await member.keyboard.press(
      browserName === "webkit" && process.platform === "darwin"
        ? "Alt+Tab"
        : "Tab",
    );
    await expect(
      member.getByRole("button", { name: "Hyväksy kutsu", exact: true }),
    ).toBeFocused();
    const pendingAccessibility = await new AxeBuilder({ page: member })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(pendingAccessibility.violations).toEqual([]);
    await member.screenshot({
      path: info.outputPath("group-finnish-invitation.png"),
      fullPage: true,
    });
    await member
      .getByRole("button", { name: "Hyväksy kutsu", exact: true })
      .focus();
    await member.keyboard.press("Enter");
    await expect(
      member.getByRole("heading", { name: "Ryhmän jäsenet", exact: true }),
    ).toBeVisible();
    const accessibility = await new AxeBuilder({ page: member })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await member.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await memberContext.close();
  }
});

test("an individual reservation can become a group and declining keeps the organizer reserved", async ({
  page,
  browser,
}) => {
  const member = await browser.newPage({ baseURL: testOrigin });
  try {
    await signIn(page);
    await page.goto(wishPath);
    await page
      .getByRole("button", { name: "Reserve wish", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toBeVisible();
    const groupPath = await start(page);
    await invite(page);
    await signIn(member, accounts.member);
    await member.goto(groupPath);
    await member
      .getByRole("button", { name: "Decline invitation", exact: true })
      .click();
    await expect(member).toHaveURL(/\/reservations$/);
    await expect(
      member.getByText("No pending group invitations."),
    ).toBeVisible();
    await page.goto(groupPath);
    await expect(
      page.getByText("1 person has joined, including the organizer."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Pending invitations", exact: true }),
    ).toHaveCount(0);
    await page.goto("/en/reservations");
    await expect(
      page.getByRole("link", { name: "Manage group reservation", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /favorites/ })).toHaveCount(
      0,
    );
  } finally {
    await member.close();
  }
});

test("people picker supports keyboard selection, clearing, empty results and Finnish reflow", async ({
  page,
}, info) => {
  const db = testPrisma();
  try {
    await db.user.update({
      where: { id: "e2e-owner" },
      data: { name: "e2e-owner" },
    });
    await db.user.update({
      where: { id: "e2e-member" },
      data: { name: "Demo Friend" },
    });
  } finally {
    await db.$disconnect();
  }
  await signIn(page);
  const groupPath = await start(page);
  const members = page.getByRole("region", {
    name: "Group members",
    exact: true,
  });
  await expect(members.getByText("e2e-owner", { exact: true })).toBeVisible();
  await expect(members.getByText("@e2e-owner", { exact: true })).toHaveCount(0);
  const input = page.getByRole("combobox", { name: "Name or username" });
  await input.fill("e2e-member");
  const option = page.getByRole("option", { name: /e2e-member/ });
  await expect(option).toBeVisible();
  await expect(option.getByText("Demo Friend", { exact: true })).toBeVisible();
  await expect(option.getByText("@e2e-member", { exact: true })).toBeVisible();
  await input.press("ArrowDown");
  await expect(option).toHaveAttribute("aria-selected", "true");
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.press("ArrowDown");
  await expect(option).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("people-picker.png"),
    fullPage: true,
  });
  await page
    .getByRole("region", { name: "Invite people", exact: true })
    .screenshot({ path: info.outputPath("people-picker-detail.png") });
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Invite e2e-member", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await input.fill("nobody-matches-this-name");
  await expect(
    page.getByText(
      "No eligible people found. Previously invited people cannot be invited again to this reservation.",
    ),
  ).toBeVisible();
  await input.fill("e2e-member");
  await expect(option).toBeVisible();
  await input.fill("e");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.goto(groupPath.replace("/en/", "/fi/"));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.documentElement.classList.add("dark");
  });
  await page
    .getByRole("combobox", { name: "Nimi tai käyttäjänimi" })
    .fill("e2e-member");
  await expect(page.getByRole("option", { name: /e2e-member/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  const finnishOption = page.getByRole("option", { name: /e2e-member/ });
  if (info.project.use.hasTouch) await finnishOption.tap();
  else await finnishOption.click();
  await expect(
    page.getByRole("button", { name: "Kutsu e2e-member", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("people-picker-finnish-large.png"),
    fullPage: true,
  });
});

test("reservation actions align and group disclosure stays compact", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(wishPath);
  const disclosure = page
    .getByRole("main")
    .locator("details")
    .filter({ hasText: "Reserve with others" });
  const summary = disclosure.locator("summary");
  await expect(summary).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const closed = await disclosure.boundingBox();
  expect(closed?.height).toBeLessThan(100);
  await summary.click();
  const description = disclosure.getByText(
    "You coordinate the gift. Invite people after reserving; they choose whether to join. No payment is collected.",
  );
  const summaryBox = await summary.boundingBox();
  const descriptionBox = await description.boundingBox();
  expect(descriptionBox!.y - (summaryBox!.y + summaryBox!.height)).toBeLessThan(
    20,
  );
  const checkbox = disclosure.getByRole("checkbox");
  const labelText = disclosure.locator("label > span");
  const checkboxBox = await checkbox.boundingBox();
  const labelBox = await labelText.boundingBox();
  expect(Math.abs(checkboxBox!.y - labelBox!.y)).toBeLessThan(8);
  await page.screenshot({
    path: info.outputPath("group-disclosure.png"),
    fullPage: true,
  });
  await disclosure.screenshot({
    path: info.outputPath("group-disclosure-detail.png"),
  });
  await checkbox.check();
  await disclosure
    .getByRole("button", { name: "Start group reservation" })
    .click();
  await expect(page).toHaveURL(/\/reservations\/[^/]+$/);
  const db = testPrisma();
  try {
    await db.wish.create({
      data: {
        id: "e2e-group-individual-wish",
        wishlistId: listId,
        title: "Individual gift",
        priority: 3,
        reservations: { create: { userId: "e2e-owner" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
  await page.goto("/en/reservations");
  const empty = page.getByRole("region", {
    name: "Group invitations",
    exact: true,
  });
  await expect(empty).toBeVisible();
  expect((await empty.boundingBox())!.height).toBeLessThan(100);
  const manage = page.getByRole("link", { name: "Manage group reservation" });
  const cancel = page.getByRole("button", {
    name: "Cancel reservation",
    exact: true,
  });
  await expect(manage).toBeVisible();
  await expect(cancel).toBeVisible();
  const manageBox = await manage.boundingBox();
  const cancelBox = await cancel.boundingBox();
  expect(Math.abs(manageBox!.height - cancelBox!.height)).toBeLessThan(2);
  if (info.project.name === "desktop-chromium") {
    expect(Math.abs(manageBox!.y - cancelBox!.y)).toBeLessThan(2);
  }
  await page.screenshot({
    path: info.outputPath("reservation-alignment.png"),
    fullPage: true,
  });
});

test("group emails have readable localized layouts and authenticated links", async ({
  page,
}, info) => {
  const width = info.project.use.isMobile ? 320 : 1280;
  await page.setViewportSize({ width, height: 800 });
  const previews: {
    locale: string;
    kind: string;
    url: string;
    html: string;
  }[] = JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", "tsx", "e2e/render-group-emails.ts"],
      { encoding: "utf8" },
    ),
  );
  for (const { locale, kind, url, html } of previews) {
    // Email clients supply their own viewport. Give the browser preview the
    // actual device width rather than mobile Chromium's default 980px canvas.
    await page.setContent(
      html.replace(
        "<head>",
        '<head><meta name="viewport" content="width=device-width, initial-scale=1">',
      ),
    );
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const label =
      locale === "fi"
        ? kind === "INVITED"
          ? "Tarkista kutsu"
          : "Hallitse ryhmävarausta"
        : kind === "INVITED"
          ? "Review invitation"
          : "Manage group reservation";
    await expect(
      page.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("href", url);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`group-email-${locale}-${kind.toLowerCase()}.png`),
      fullPage: true,
      scale: "css",
    });
  }
});
