import { type Browser, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { testOrigin } from "./environment";
import { openMainNavigation } from "./navigation";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-guest-browser";
const listUrl = `/en/lists/${listId}`;
const guestUrl = `/en/guest/lists/${listId}`;
const managementUrl = `${listUrl}/guest-links`;

const guestPage = (browser: Browser) => {
  const { viewport, isMobile, hasTouch } = test.info().project.use;
  return browser.newPage({ baseURL: testOrigin, viewport, isMobile, hasTouch });
};

const signIn = async (page: Page, account = accounts.owner) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

const createLink = async (page: Page, label = "Family guests") => {
  await page.goto(managementUrl);
  await page
    .getByRole("textbox", { name: "Link label", exact: true })
    .fill(label);
  const submit = page.getByRole("button", {
    name: "Create guest link",
    exact: true,
  });
  const consent = page.getByRole("checkbox", { name: /Anyone with this link/ });
  await expect(submit).toBeDisabled();
  await consent.check();
  await expect(submit).toBeEnabled();
  await consent.uncheck();
  await expect(submit).toBeDisabled();
  await consent.check();
  await page
    .getByRole("button", { name: "Create guest link", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Guest link created");
  const url = await page
    .getByLabel("New guest link", { exact: true })
    .inputValue();
  expect(url).toMatch(/\/guest#[a-z2-7]{32}$/);
  await expect(
    page.getByLabel("New guest link", { exact: true }),
  ).toBeFocused();
  return url;
};

const visit = async (page: Page, link: string) => {
  await page.goto(link);
  await expect(page).toHaveURL(guestUrl);
  await expect(
    page.getByText("Guest-only private list", { exact: true }),
  ).toBeVisible();
};

const status = (page: Page, url: string, method = "GET") =>
  page.evaluate(
    async ({ url, method }) => {
      const response = await fetch(url, { method, cache: "no-store" });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        text: response.headers.get("content-type")?.includes("text")
          ? await response.text()
          : "",
      };
    },
    { url, method },
  );

test.beforeEach(async () => {
  await resetFixtures();
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
        id: listId,
        title: "Guest-only private list",
        ownerId: "e2e-owner",
        visibility: "PRIVATE",
        publication: "PUBLISHED",
        reservationsEnabled: true,
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: [
            {
              id: "e2e-guest-available",
              title: "Available guest wish",
              description: "Shared description",
              externalUrl: "https://shop.example.test/product",
              priceMinor: 1299,
              currency: "EUR",
              priority: 4,
            },
            {
              id: "e2e-guest-hidden",
              title: "Hidden guest secret",
              hidden: true,
            },
            {
              id: "e2e-guest-fulfilled",
              title: "Fulfilled guest secret",
              fulfilledAt: new Date(),
            },
            {
              id: "e2e-guest-reserved",
              title: "Reserved guest secret",
              reservations: { create: { userId: "e2e-owner" } },
            },
          ],
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("create once, open anonymously, protect secrets, show only available content and private images", async ({
  page,
  browser,
}, info) => {
  await signIn(page);
  await page.goto(`${listUrl}/edit`);
  const buffer = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Guest cover");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(page.getByRole("img", { name: "Guest cover" })).toHaveJSProperty(
    "naturalWidth",
    40,
  );
  await page.goto(`${listUrl}/sharing`);
  await page.getByRole("link", { name: "Manage guest links" }).click();
  await expect(
    page.getByRole("heading", { name: "Guest links", exact: true }),
  ).toBeVisible();
  const link = await createLink(page);
  const token = new URL(link).hash.slice(1);
  await page.reload();
  await expect(page.getByLabel("New guest link", { exact: true })).toHaveCount(
    0,
  );
  expect(await page.content()).not.toContain(token);
  const guest = await guestPage(browser);
  const requests: { url: string; referrer: string | undefined }[] = [];
  guest.on("request", (request) =>
    requests.push({ url: request.url(), referrer: request.headers().referer }),
  );
  try {
    await visit(guest, link);
    const cover = guest.getByRole("img", { name: "Guest cover" });
    await expect(cover).toHaveJSProperty("naturalWidth", 40);
    const coverSize = await cover.boundingBox();
    expect(coverSize?.width).toBeLessThanOrEqual(144);
    expect(coverSize?.height).toBeLessThanOrEqual(108);
    const imageUrl = (await cover.getAttribute("src"))!;
    expect(imageUrl).toContain(`${guestUrl.replace("/en", "")}/media/`);
    expect(await guest.evaluate(() => document.cookie)).not.toContain(token);
    expect(await guest.content()).not.toContain(token);
    const cookies = await guest.context().cookies();
    expect(
      cookies.find(
        ({ name, path }) => name === "guest_access" && path === guestUrl,
      ),
    ).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: guestUrl,
    });
    for (const secret of [
      "Hidden guest secret",
      "Fulfilled guest secret",
      "Reserved guest secret",
      "e2e-owner",
      "e2e-member",
    ])
      expect(await guest.content()).not.toContain(secret);
    const imageResponse = await status(guest, imageUrl);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers["cache-control"]).toContain("no-store");
    const contentResponse = await status(guest, guestUrl);
    expect(contentResponse.headers["cache-control"]).toContain("no-store");
    expect(contentResponse.headers["referrer-policy"]).toBe("no-referrer");
    await guest.screenshot({
      path: info.outputPath("guest-list.png"),
      fullPage: true,
      scale: "css",
    });
    await guest
      .getByRole("link", { name: "Available guest wish", exact: true })
      .click();
    await expect(
      guest.getByRole("heading", { name: "Available guest wish", exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("button", { name: /Reserve|Edit|Join/ }),
    ).toHaveCount(0);
    let productReferrer: string | undefined;
    await guest
      .context()
      .route("https://shop.example.test/**", async (route) => {
        productReferrer = route.request().headers().referer;
        await route.fulfill({
          contentType: "text/html",
          body: "<p>Product</p>",
        });
      });
    const popupPromise = guest.waitForEvent("popup");
    await guest
      .getByRole("link", { name: "View product (opens in a new tab)" })
      .click();
    const popup = await popupPromise;
    await expect(popup.getByText("Product", { exact: true })).toBeVisible();
    expect(productReferrer).toBeUndefined();
    await popup.close();
    expect(JSON.stringify(requests)).not.toContain(token);
    expect((await status(guest, listUrl)).text).not.toContain(
      "Guest-only private list",
    );
    expect(
      (
        await status(
          guest,
          imageUrl.replace(
            `${guestUrl.replace("/en", "")}/media`,
            "/api/media",
          ),
        )
      ).status,
    ).toBe(404);
  } finally {
    await guest.close();
  }
});

test("signed-in owners get the same guest restrictions and cannot replay a write on guest routes", async ({
  page,
}) => {
  await signIn(page);
  const link = await createLink(page);
  await page.goto(`${listUrl}/edit`);
  await page
    .getByLabel("Title", { exact: true })
    .fill("Guest-only private list");
  const submitted = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/edit"),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const actionRequest = await submitted;
  await expect(
    page
      .locator("header")
      .getByText("Guest-only private list", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Changes saved.");
  const headers = Object.fromEntries(
    Object.entries(await actionRequest.allHeaders()).filter(([key]) =>
      [
        "content-type",
        "next-action",
        "next-router-state-tree",
        "accept",
      ].includes(key),
    ),
  );
  await visit(page, link);
  for (const id of ["hidden", "fulfilled", "reserved"]) {
    const response = await status(page, `${guestUrl}/wishes/e2e-guest-${id}`);
    expect(response.text).not.toContain(
      `${id[0].toUpperCase()}${id.slice(1)} guest secret`,
    );
  }
  const replayStatus = await page.evaluate(
    async ({ url, headers, body }) =>
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: new Uint8Array(body),
        })
      ).status,
    {
      url: guestUrl,
      headers,
      body: Array.from(actionRequest.postDataBuffer()!),
    },
  );
  expect(replayStatus).toBe(405);
  for (const method of ["PUT", "PATCH", "DELETE"])
    expect((await status(page, guestUrl, method)).status).toBe(405);
  await page
    .getByRole("button", { name: "Open Wishlist", exact: true })
    .click();
  await expect(page).toHaveURL(/\/en\/lists$/);
  await openMainNavigation(page);
  await expect(
    page.getByRole("link", { name: "Account", exact: true }),
  ).toBeVisible();
  await page.goto(listUrl);
  await expect(
    page.getByRole("link", { name: "List settings", exact: true }),
  ).toBeVisible();
});

test("revocation invalidates an already-open guest view and its image, including conditional requests", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto(`${listUrl}/wishes/e2e-guest-available/edit`);
  const buffer = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "wish.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Image description", { exact: true })
    .fill("Guest wish image");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Guest wish image" }),
  ).toHaveJSProperty("naturalWidth", 20);
  const link = await createLink(page);
  const guest = await guestPage(browser);
  try {
    await visit(guest, link);
    const imageUrl = (await guest
      .getByRole("img", { name: "Guest wish image" })
      .getAttribute("src"))!;
    await page
      .getByRole("button", { name: "Disable link", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Guest link disabled");
    await expect(
      page.getByLabel("New guest link", { exact: true }),
    ).toHaveCount(0);
    const result = await guest.evaluate(
      async (url) =>
        (
          await fetch(url, {
            headers: {
              "If-None-Match": "*",
              "If-Modified-Since": new Date().toUTCString(),
            },
          })
        ).status,
      imageUrl,
    );
    expect(result).toBe(404);
    await guest.reload();
    await expect(
      guest.getByRole("heading", {
        name: "Guest-only private list",
        exact: true,
      }),
    ).toHaveCount(0);
    await guest.goto(link);
    await expect(guest.getByRole("main").getByRole("alert")).toContainText(
      "unavailable",
    );
  } finally {
    await guest.close();
  }
});

test("Premium expiry keeps old links working but blocks new ones and still permits revocation", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const link = await createLink(page);
  const prisma = testPrisma();
  const guest = await guestPage(browser);
  try {
    await prisma.premiumGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await page
      .locator("summary")
      .filter({ hasText: "Create another link" })
      .click();
    await page.getByLabel("Link label").fill("Stale attempt");
    await page.getByRole("checkbox", { name: /Anyone with this link/ }).check();
    await page
      .getByRole("button", { name: "Create guest link", exact: true })
      .click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Active Premium",
    );
    await visit(guest, link);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Create guest link", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Disable link", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Guest link disabled");
    await expect(
      page.getByLabel("New guest link", { exact: true }),
    ).toHaveCount(0);
    await guest.reload();
    await expect(
      guest.getByRole("heading", {
        name: "Guest-only private list",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
    await guest.close();
  }
});

test("expiry clears open content and links cannot be used across lists or without a token", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const link = await createLink(page);
  const prisma = testPrisma();
  const guest = await guestPage(browser);
  try {
    await prisma.guestLink.updateMany({
      where: { wishlistId: listId },
      data: { expiresAt: new Date(Date.now() + 5000) },
    });
    await visit(guest, link);
    expect(
      (await status(guest, "/en/guest/lists/e2e-private-list")).text,
    ).not.toContain("Another person's private list");
    await expect(
      guest.getByRole("heading", { name: "Guest link expired", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      guest.getByRole("heading", {
        name: "Guest-only private list",
        exact: true,
      }),
    ).toHaveCount(0);
    await guest.reload();
    await expect(
      guest.getByRole("heading", {
        name: "Guest-only private list",
        exact: true,
      }),
    ).toHaveCount(0);
    await guest.goto("/en/guest");
    await expect(guest.getByRole("main").getByRole("alert")).toContainText(
      "unavailable",
    );
  } finally {
    await prisma.$disconnect();
    await guest.close();
  }
});

test("drafts and archived lists deny guest access; exchange rejects foreign origins and oversized bodies", async ({
  page,
  browser,
  request,
}) => {
  await signIn(page);
  const link = await createLink(page);
  const token = new URL(link).hash.slice(1);
  expect(
    (
      await request.post("/api/guest", {
        data: token,
        headers: { origin: "https://foreign.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/guest", {
        data: "a".repeat(100),
        headers: { origin: testOrigin },
      })
    ).status(),
  ).toBe(400);
  const guest = await guestPage(browser);
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: listId },
      data: { publication: "DRAFT" },
    });
    await guest.goto(link);
    await expect(guest.getByRole("main").getByRole("alert")).toContainText(
      "unavailable",
    );
    await prisma.wishlist.update({
      where: { id: listId },
      data: { publication: "PUBLISHED" },
    });
    await visit(guest, link);
    await prisma.wishlist.update({
      where: { id: listId },
      data: { archivedAt: new Date() },
    });
    await guest.reload();
    await expect(
      guest.getByRole("heading", {
        name: "Guest-only private list",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
    await guest.close();
  }
});

test("creation and guest navigation work with a keyboard at 320px in dark mode", async ({
  page,
  browser,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  const link = await createLink(
    page,
    "A long label for the people attending my birthday party",
  );
  await page.screenshot({
    path: info.outputPath("guest-management-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const guest = await browser.newPage({
    baseURL: testOrigin,
    viewport: { width: 320, height: 740 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  try {
    await visit(guest, link);
    await guest
      .getByRole("link", { name: "Available guest wish", exact: true })
      .focus();
    await guest.keyboard.press("Enter");
    await expect(
      guest.getByRole("heading", { name: "Available guest wish", exact: true }),
    ).toBeVisible();
    expect(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await guest.screenshot({
      path: info.outputPath("guest-wish-narrow-dark.png"),
      fullPage: true,
      scale: "css",
    });
  } finally {
    await guest.close();
  }
});
