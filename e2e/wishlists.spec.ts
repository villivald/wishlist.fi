import { expect, type Page, test } from "@playwright/test";
import { testOrigin } from "./environment";
import { accounts, resetFixtures, testPrisma } from "./seed";

const signIn = async (page: Page, account = accounts.owner) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

const createList = async (page: Page, title: string) => {
  await page.getByRole("link", { name: "Create a list", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();

  return new URL(page.url()).pathname;
};

test.beforeEach(resetFixtures);

test("create, validate, edit, publish, unpublish, and confirm deletion", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.getByRole("link", { name: "Create a list", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("   ");
  await expect(
    page.getByRole("radio", { name: "Public", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Invited people", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Description (optional)")
    .fill("Ideas for a quiet weekend.\nBooks and a little time outdoors.");
  await expect(page.getByLabel("Allow reservations")).toBeChecked();
  await page.getByRole("button", { name: "Create list", exact: true }).click();

  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByText("Enter a title", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Description (optional)")).toHaveValue(
    /quiet weekend/,
  );
  await expect(page.getByLabel("Allow reservations")).toBeChecked();

  await page.getByLabel("Title", { exact: true }).fill("Weekend wishes");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("List created.");
  const listUrl = new URL(page.url()).pathname;

  await page.getByRole("link", { name: "List settings", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Birthday wishes");
  await page.getByLabel("Allow reservations").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "List settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Birthday wishes",
  );
  await expect(page.getByLabel("Allow reservations")).not.toBeChecked();
  await expect(page.getByRole("status")).toContainText("Changes saved");

  await page.goto(listUrl);
  await expect(page.getByRole("button", { name: "Hide list" })).toBeVisible();

  const visitor = await browser.newPage({ baseURL: testOrigin });

  try {
    await visitor.goto(listUrl);
    await expect(
      visitor.getByRole("heading", { name: "Birthday wishes", exact: true }),
    ).toBeVisible();
    await expect(
      visitor.getByRole("link", { name: "List settings", exact: true }),
    ).toHaveCount(0);

    await page.screenshot({
      path: info.outputPath("published-list.png"),
      fullPage: true,
      animations: "disabled",
      scale: "css",
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Hide list" }).click();
    await expect(page.getByRole("status")).toContainText(
      "List hidden from viewers",
    );
    await visitor.reload();
    await expect(
      visitor.getByRole("heading", { name: "Birthday wishes", exact: true }),
    ).toHaveCount(0);

    await page
      .getByRole("link", { name: "List settings", exact: true })
      .click();
    await page.getByRole("link", { name: "Delete list", exact: true }).click();
    await page.getByRole("link", { name: "Cancel and keep list" }).click();
    await expect(
      page.getByRole("heading", { name: "List settings", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Delete list", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Delete permanently" }),
    ).toBeDisabled();
    await expect(page).toHaveURL(/\/delete$/);
    await page.getByLabel("I understand this cannot be undone").check();
    await expect(
      page.getByRole("button", { name: "Delete permanently" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page).toHaveURL(/\/lists$/);
    await expect(page.getByRole("status")).toContainText("List deleted");
    await expect(
      page.getByRole("heading", { name: "No lists yet" }),
    ).toBeVisible();
    await page.goto(listUrl);
    await expect(
      page.getByRole("heading", { name: "Birthday wishes", exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await visitor.close();
  }
});

test("draft/private content stays out of direct responses and another account cannot replay an edit", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const listUrl = await createList(page, "Draft title must stay secret");
  await page.getByRole("button", { name: "Hide list", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "List access", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "List visibility", exact: true }),
  ).toContainText("Hidden · Admins only");
  const other = await browser.newPage({ baseURL: testOrigin });

  try {
    for (const path of [
      listUrl,
      "/en/lists/e2e-private-list",
      "/en/lists/e2e-archived-list",
    ]) {
      const response = await other.request.get(path);
      expect(await response.text()).not.toContain(
        "Draft title must stay secret",
      );
      expect(await response.text()).not.toContain(
        "Another person's private list",
      );
      expect(await response.text()).not.toContain("Private wish");
    }

    await signIn(other, accounts.member);
    await other.goto(listUrl);
    await expect(
      other.getByRole("heading", {
        name: "Draft title must stay secret",
        exact: true,
      }),
    ).toHaveCount(0);
    await other.goto(`${listUrl}/edit`);
    await expect(other.getByLabel("Title", { exact: true })).toHaveCount(0);
    await other.goto(`${listUrl}/delete`);
    await expect(
      other.getByRole("button", { name: "Delete permanently" }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "List access", exact: true }).click();
    await page.getByRole("radio", { name: "Public", exact: true }).check();
    await page
      .getByRole("region", { name: "Who can view this list?", exact: true })
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("button", { name: "Make list public", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Who can view this list?", exact: true })
        .locator('button[type="submit"]'),
    ).toHaveCount(0);
    await page.goto(listUrl);
    await expect(page.getByRole("button", { name: "Hide list" })).toBeVisible();
    await other.goto(listUrl);
    await expect(
      other.getByRole("heading", {
        name: "Draft title must stay secret",
        exact: true,
      }),
    ).toBeVisible();

    await page
      .getByRole("link", { name: "List settings", exact: true })
      .click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("First legitimate edit");
    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().endsWith("/edit"),
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    const originalRequest = await requestPromise;
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "First legitimate edit",
    );
    await expect(
      page
        .locator("header")
        .getByText("First legitimate edit", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("Title", { exact: true }).fill("Latest owner edit");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Latest owner edit",
    );
    await expect(
      page.locator("header").getByText("Latest owner edit", { exact: true }),
    ).toBeVisible();

    // Replay a real action with the other browser's session, without parsing action internals.
    const headers = Object.fromEntries(
      Object.entries(await originalRequest.allHeaders()).filter(([key]) =>
        [
          "content-type",
          "next-action",
          "next-router-state-tree",
          "accept",
        ].includes(key),
      ),
    );
    const replay = await other.evaluate(
      async ({ url, headers, body }) => {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: new Uint8Array(body),
        });

        return response.text();
      },
      {
        url: originalRequest.url(),
        headers,
        body: Array.from(originalRequest.postDataBuffer()!),
      },
    );

    expect(replay).toContain("do not have permission");
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Latest owner edit",
    );
    await expect(
      page.locator("header").getByText("Latest owner edit", { exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("a stale admin form is denied after access is revoked", async ({
  page,
}) => {
  const prisma = testPrisma();

  try {
    const list = await prisma.wishlist.create({
      data: {
        title: "Owner's draft",
        ownerId: "e2e-owner",
        memberships: {
          create: [
            { userId: "e2e-owner", role: "ADMIN" },
            { userId: "e2e-member", role: "ADMIN" },
          ],
        },
      },
    });

    await signIn(page, accounts.member);
    await page.goto(`/en/lists/${list.id}/edit`);
    await page
      .getByLabel("Title", { exact: true })
      .fill("An unauthorized change");
    await prisma.membership.delete({
      where: {
        wishlistId_userId: { wishlistId: list.id, userId: "e2e-member" },
      },
    });
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "do not have permission",
    );
    await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
    expect(
      (await prisma.wishlist.findUniqueOrThrow({ where: { id: list.id } }))
        .title,
    ).toBe("Owner's draft");
  } finally {
    await prisma.$disconnect();
  }
});

test("long titles and forms fit a narrow dark screen with keyboard access", async ({
  page,
}, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 727 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.reload();
  const title = "Birthday".repeat(25);
  await createList(page, title);
  await page.getByRole("link", { name: "Back to my lists" }).click();
  await expect(
    page.getByRole("link", { name: title, exact: true }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: title, exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "List settings", exact: true }).click();

  await page.getByLabel("Title", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Description (optional)")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Allow reservations")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.screenshot({
    path: info.outputPath("narrow-dark-list-editor.png"),
    fullPage: true,
    animations: "disabled",
    scale: "css",
  });
});
