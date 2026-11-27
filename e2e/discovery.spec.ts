import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { testEnvironment } from "./environment";
import { openMainNavigation } from "./navigation";
import { accounts, newAccount, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-discovery-list";
const wishId = "e2e-discovery-wish";
const wishUrl = `/en/lists/${listId}/wishes/${wishId}`;

const submitSignIn = async (page: Page, account = accounts.member) => {
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
};

test("features eligible lists in editorial order on the Browse landing view", async ({
  page,
}, info) => {
  const prisma = testPrisma();
  const defaults = {
    ownerId: "e2e-owner",
    publication: "PUBLISHED",
    visibility: "PUBLIC",
    reservationsEnabled: false,
  } as const;
  try {
    await prisma.$transaction(
      [
        {
          ...defaults,
          id: "e2e-ideas-budget",
          title: "Small gifts under €25",
        },
        {
          ...defaults,
          id: "e2e-ideas-experience",
          title: "Experiences to share",
          theme: "playful",
        },
        {
          ...defaults,
          id: "e2e-ideas-draft",
          title: "Draft editorial ideas",
          publication: "DRAFT" as const,
        },
        {
          ...defaults,
          id: "e2e-ideas-private",
          title: "Private editorial ideas",
          visibility: "PRIVATE" as const,
        },
        {
          ...defaults,
          id: "e2e-ideas-archived",
          title: "Archived editorial ideas",
          archivedAt: new Date(),
        },
        {
          ...defaults,
          id: "e2e-ideas-reservable",
          title: "Reservable editorial ideas",
          reservationsEnabled: true,
        },
      ].map((data) =>
        prisma.wishlist.create({
          data: {
            ...data,
            memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
          },
        }),
      ),
    );
  } finally {
    await prisma.$disconnect();
  }

  await page.goto("/en/browse");
  const curated = page.getByRole("region", { name: "Wishlist inspiration" });
  await expect(curated.getByText("Curated by Wishlist")).toBeVisible();
  await expect(curated.getByRole("heading", { level: 3 })).toHaveText([
    "For Kids",
    "Small gifts under €25",
  ]);
  await expect(
    curated.getByText(
      "Ideas for children of different ages, with play and everyday family life in mind.",
    ),
  ).toBeVisible();
  await expect(
    curated.getByText("Reservations off", { exact: true }),
  ).toHaveCount(0);
  const publicLists = page.getByRole("list", { name: "Public lists" });
  await expect(publicLists.getByRole("heading")).toHaveText([
    "Reservable editorial ideas",
    "Birthday reading list",
  ]);
  await expect(
    publicLists.getByText("Reservations enabled", { exact: true }),
  ).toHaveCount(2);
  await curated.screenshot({
    path: info.outputPath("curated-browse.png"),
    scale: "css",
  });
  const curatedLink = curated
    .getByRole("heading", { name: "For Kids" })
    .getByRole("link");
  await curatedLink.focus();
  await curatedLink.press("Enter");
  const detail = page.getByRole("main");
  await expect(
    detail.getByRole("heading", { level: 1, name: "For Kids" }),
  ).toBeVisible();
  await expect(curated).toHaveCount(0);
  await expect(
    detail.getByText("Curated by Wishlist", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Start your own list" }),
  ).toHaveAttribute("href", "/en/sign-up");

  await page.goto("/en/browse?view=lists&q=Experiences");
  await expect(curated).toHaveCount(0);
  await expect(publicLists.getByRole("heading")).toHaveText(["For Kids"]);
  await page.goto("/fi/browse?view=lists&q=leikkiin");
  await expect(page.getByRole("heading", { name: "Lapsille" })).toBeVisible();

  await page.goto("/en/browse?view=lists&q=Books");
  await expect(publicLists.getByRole("heading")).toHaveCount(0);

  for (const query of [
    "view=wishes",
    "view=users",
    "page=2",
    "sort=title",
    "reservable=on",
    "owner=e2e-owner",
  ]) {
    await page.goto(`/en/browse?${query}`);
    await expect(curated).toHaveCount(0);
  }

  await page.setViewportSize({ width: 320, height: 750 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/fi/browse?view=lists");
  const finnishCurated = page.getByRole("region", { name: "Lahjaideoita" });
  await expect(finnishCurated.getByText("Wishlistin valitsemat")).toBeVisible();
  await expect(finnishCurated.getByRole("heading", { level: 3 })).toHaveText([
    "Lapsille",
    "Small gifts under €25",
  ]);
  const preview = finnishCurated
    .getByRole("link", { name: /Lapsille/ })
    .first();
  const classicPreview = finnishCurated
    .getByRole("link", { name: /Small gifts under €25/ })
    .first();
  const coverColor = (link: typeof preview) =>
    link
      .locator(":scope > div")
      .evaluate((cover) => getComputedStyle(cover).backgroundColor);
  expect(await coverColor(preview)).not.toEqual(
    await coverColor(classicPreview),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .include('[aria-labelledby="wishlist-inspiration"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await finnishCurated.screenshot({
    path: info.outputPath("curated-browse-fi-dark.png"),
    scale: "css",
  });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await finnishCurated
    .getByRole("heading", { name: "Lapsille" })
    .getByRole("link")
    .click();
  await expect(
    detail.getByRole("heading", { level: 1, name: "Lapsille" }),
  ).toBeVisible();
  await expect(
    detail.getByText(
      "Ideoita eri-ikäisille lapsille niin leikkiin kuin perheen yhteiseen arkeen.",
    ),
  ).toBeVisible();
});

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: listId,
        title: "Birthday reading list",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: [
            {
              id: wishId,
              title: "A garden book",
              authorId: "e2e-owner",
              priceMinor: 1999,
              currency: "EUR",
              priority: 4,
            },
            {
              id: "e2e-hidden-discovery",
              title: "Hidden discovery secret",
              authorId: "e2e-owner",
              hidden: true,
            },
            {
              id: "e2e-fulfilled-discovery",
              title: "Fulfilled discovery secret",
              authorId: "e2e-owner",
              fulfilledAt: new Date(),
            },
          ],
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("browse another user's list, sign in, reserve and remove it from discovery", async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Browse public wishlists" }).click();
  await expect(page.getByRole("main")).toContainText("1 available wish");
  await page.screenshot({
    path: info.outputPath("browse-lists.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("link", { name: "Birthday reading list", exact: true })
    .click();
  await page.getByRole("link", { name: "A garden book", exact: true }).click();
  await page.getByRole("link", { name: "Sign in to reserve" }).click();
  await submitSignIn(page);
  await expect(page).toHaveURL(wishUrl);
  await page.getByRole("button", { name: "Reserve wish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Cancel reservation", exact: true }),
  ).toBeVisible();
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "Browse", exact: true })
    .click();
  await expect(page.getByRole("main")).toContainText("0 available wishes");
  await page.getByRole("link", { name: "Wishes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No results found" }),
  ).toBeVisible();
  const response = await request.get("/en/browse?view=wishes");
  expect(await response.text()).not.toContain("A garden book");
  expect(response.headers()["cache-control"]).toContain("no-store");
  await (
    await openMainNavigation(page)
  )
    .getByRole("link", { name: "My reservations", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "A garden book", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Save confirmation" }),
  ).toHaveText("Reservation canceled.");
  await page.goto("/en/browse?view=wishes");
  await expect(
    page.getByRole("link", { name: "A garden book", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("discovery uses public permissions even for an owner and unavailable links stay private", async ({
  page,
  request,
}) => {
  await page.goto("/en/sign-in");
  await submitSignIn(page, accounts.owner);
  await expect(page).toHaveURL(/\/lists$/);
  for (const view of ["lists", "wishes"]) {
    const response = await page.goto(`/en/browse?view=${view}`);
    const body = await response!.text();
    for (const secret of [
      "Hidden discovery secret",
      "Fulfilled discovery secret",
      "Another person's private list",
      "Archived list",
      accounts.owner.email,
      accounts.member.email,
    ]) {
      expect(body).not.toContain(secret);
    }
  }
  for (const id of ["e2e-hidden-discovery", "e2e-fulfilled-discovery"]) {
    const response = await request.get(`/en/lists/${listId}/wishes/${id}`);
    expect(await response.text()).toContain("Page not found");
    expect(await response.text()).not.toContain("discovery secret");
  }
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: listId },
      data: { publication: "DRAFT" },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "No results found" }),
    ).toBeVisible();
    const response = await request.get(wishUrl);
    expect(await response.text()).not.toContain("A garden book");
  } finally {
    await prisma.$disconnect();
  }
});

test("currency filters, pagination and keyboard search work in a narrow dark layout", async ({
  page,
}, info) => {
  const prisma = testPrisma();
  try {
    await prisma.wish.createMany({
      data: Array.from({ length: 22 }, (_, index) => ({
        id: `e2e-discovery-price-${index}`,
        title: `Reading pick ${String(index).padStart(2, "0")}`,
        wishlistId: listId,
        authorId: "e2e-owner",
        priceMinor: index * 100,
        currency: "EUR" as const,
        priority: 5,
      })),
    });
  } finally {
    await prisma.$disconnect();
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/en/browse?view=wishes");
  const filters = page.getByRole("form", { name: "Browse filters" });
  const currency = filters.getByRole("combobox", { name: "Currency" });
  const reservations = filters.getByRole("checkbox", {
    name: "Reservations enabled",
  });
  await filters.getByLabel("Search wishes").fill("Reading pick");
  await filters.getByLabel("Sort by").selectOption("price-low");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a currency",
  );
  await currency.selectOption("EUR");
  await filters.getByLabel("Minimum price").fill("0");
  await filters.getByLabel("Maximum price").fill("21");
  await filters.getByLabel("Minimum priority").selectOption("5");
  await reservations.focus();
  await page.keyboard.press("Space");
  await expect(reservations).toBeChecked();
  await expect(reservations).toBeFocused();
  const results = page.getByRole("list", { name: "Public wishes" });
  await expect(results.getByRole("listitem")).toHaveCount(20);
  await expect(results.getByRole("heading").first()).toHaveText(
    "Reading pick 00",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(results.getByRole("listitem")).toHaveCount(2);
  await expect(filters.getByLabel("Minimum price")).toHaveValue("0");
  await expect(currency).toHaveValue("EUR");
  await expect(reservations).toBeChecked();
  await page.screenshot({
    path: info.outputPath("browse-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  await page.getByRole("link", { name: "Previous page" }).click();
  await expect(results.getByRole("heading").first()).toHaveText(
    "Reading pick 00",
  );
  await currency.selectOption("USD");
  await expect(
    page.getByRole("heading", { name: "No results found" }),
  ).toBeVisible();
});

test("numbered pagination supports direct jumps and stale-page recovery", async ({
  page,
}, info) => {
  const prisma = testPrisma();
  try {
    await prisma.wish.createMany({
      data: Array.from({ length: 181 }, (_, index) => ({
        id: `e2e-pager-${index}`,
        title: `Pagination pick ${index}`,
        wishlistId: listId,
        authorId: "e2e-owner",
      })),
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/en/browse?view=wishes&q=Pagination+pick&page=5");
  const pager = page.getByRole("navigation", { name: "Browse pages" });
  const current = pager.locator('[aria-current="page"]');
  await expect(current).toHaveText(/Page 5 of 10/);
  await expect(pager.getByRole("link", { name: "Page 10" })).toHaveAttribute(
    "href",
    /view=wishes.*q=Pagination\+pick.*page=10/,
  );
  await expect(
    pager.getByText("…", { exact: true }).filter({ visible: true }),
  ).toHaveCount(2);
  await pager.screenshot({ path: info.outputPath("pagination-desktop.png") });
  const audit = await new AxeBuilder({ page })
    .include('nav[aria-label="Browse pages"]')
    .analyze();
  expect(audit.violations).toEqual([]);

  const last = pager.getByRole("link", { name: "Page 10" });
  await last.focus();
  await expect(last).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(current).toHaveText(/Page 10 of 10/);
  await expect(pager.getByRole("link", { name: "Next page" })).toHaveCount(0);
  await expect(
    page.getByRole("list", { name: "Public wishes" }).getByRole("listitem"),
  ).toHaveCount(1);

  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/fi/browse?view=wishes&q=Pagination+pick&page=5");
  const compact = page.getByRole("navigation", { name: "Hakutulossivut" });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect(
    compact.getByRole("link", { name: "Edellinen sivu" }),
  ).toBeVisible();
  await expect(
    compact.getByRole("link", { name: "Seuraava sivu" }),
  ).toBeVisible();
  await expect(compact.getByRole("link", { name: "Sivu 10" })).toBeVisible();
  await compact.screenshot({ path: info.outputPath("pagination-zoomed.png") });
  expect(
    await compact.evaluate((nav) => nav.scrollWidth <= nav.clientWidth),
  ).toBe(true);
  await page.addStyleTag({ content: "html { font-size: 100%; }" });
  await compact.screenshot({ path: info.outputPath("pagination-mobile.png") });

  await page.goto("/en/browse?view=wishes&q=Pagination+pick&page=999");
  await expect(
    page.getByRole("heading", { name: "No more results" }),
  ).toBeVisible();
  await expect(pager.getByRole("link", { name: "Last page" })).toHaveAttribute(
    "href",
    /page=10$/,
  );
  await pager.getByRole("link", { name: "Back to first page" }).click();
  await expect(current).toHaveText(/Page 1 of 10/);
  await expect(pager.getByRole("link", { name: "Previous page" })).toHaveCount(
    0,
  );
  await page.goto("/en/browse?view=wishes&q=Pagination+pick+180");
  await expect(pager).toHaveCount(0);
});

test("registration and email verification return to the wish without reserving automatically", async ({
  page,
}) => {
  await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
  });
  await page.goto(wishUrl);
  await page.getByRole("link", { name: "Sign in to reserve" }).click();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Username", { exact: true }).fill(newAccount.username);
  await page.getByLabel("Email", { exact: true }).fill(newAccount.email);
  await page.getByLabel("Password", { exact: true }).fill(newAccount.password);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(newAccount.password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/email-verification\?returnTo=/);
  const response = await fetch(
    `${testEnvironment.MAILPIT_URL}/api/v1/message/latest`,
  );
  const message = (await response.json()) as { Text: string };
  const code = message.Text.match(/\b[A-Z]{8}\b/)?.[0];
  expect(code).toBeTruthy();
  await page.getByLabel("Verification code", { exact: true }).fill(code!);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page).toHaveURL(wishUrl);
  await expect(
    page.getByRole("button", { name: "Reserve wish", exact: true }),
  ).toBeVisible();
});

test("tampered return destinations are rejected and revoked content is checked after sign-in", async ({
  page,
}) => {
  await page.goto(wishUrl);
  await page.getByRole("link", { name: "Sign in to reserve" }).click();
  await page.locator('input[name="returnTo"]').evaluate((input) => {
    (input as HTMLInputElement).value = "https://example.com/";
  });
  await submitSignIn(page);
  await expect(page).toHaveURL(/\/lists$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto(wishUrl);
  await page.getByRole("link", { name: "Sign in to reserve" }).click();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: listId },
      data: { publication: "DRAFT" },
    });
  } finally {
    await prisma.$disconnect();
  }
  await submitSignIn(page);
  await expect(page).toHaveURL(wishUrl);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("A garden book");
});
