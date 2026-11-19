import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { accounts, resetFixtures, testPrisma } from "./seed";

const path = "/en/lists/e2e-feedback";
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
    await db.wishlist.create({
      data: {
        id: "e2e-feedback",
        title: "A few lovely things",
        publication: "PUBLISHED",
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test("visibility success keeps the toolbar stable and pauses while keyboard-focused", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(path);
  const control = page.getByRole("region", { name: "List visibility" });
  const hide = page.getByRole("button", { name: "Hide list", exact: true });
  await expect(hide).toBeVisible();
  const header = page.locator("header").filter({
    has: page.getByRole("heading", {
      name: "A few lovely things",
      exact: true,
    }),
  });
  const before = await header.boundingBox();
  await page.clock.install();
  await hide.click();
  const toast = page.getByRole("status", { name: "Save confirmation" });
  await expect(toast).toContainText("List hidden from viewers.");
  await expect(control.getByRole("status")).toHaveCount(0);
  const change = page.getByRole("button", {
    name: "Publish list",
    exact: true,
  });
  await expect(change).toBeVisible();
  expect((await header.boundingBox())?.height).toBeLessThanOrEqual(
    (before?.height ?? 0) + 2,
  );
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    const button = await change.boundingBox();
    const sharing = await header
      .getByRole("button", { name: "QR card", exact: true })
      .boundingBox();
    expect(
      Math.abs(
        button!.y + button!.height / 2 - (sharing!.y + sharing!.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
  }
  const close = toast.getByRole("button", { name: "Dismiss confirmation" });
  await expect(close).not.toBeFocused();
  await header.screenshot({
    path: info.outputPath("header-after-success.png"),
  });
  await change.focus();
  await toast.hover();
  await page.clock.fastForward(9000);
  await expect(toast).toBeVisible();
  await close.focus();
  await page.mouse.move(0, 0);
  await page.clock.fastForward(9000);
  await expect(toast).toBeVisible();
  await close.press("Escape");
  await expect(toast).toHaveCount(0);
  await expect(change).toBeFocused();
  const db = testPrisma();
  try {
    await db.wishlist.update({
      where: { id: "e2e-feedback" },
      data: { publication: "PUBLISHED" },
    });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await hide.click();
  await expect(toast).toContainText("List hidden from viewers.");
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(9000);
  await expect(toast).toBeVisible();
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(9000);
  await expect(toast).toHaveCount(0);
  await expect(control).toContainText("Hidden · Admins only");
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
});

test("form errors persist and successful saves use one temporary confirmation", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${path}/edit`);
  const title = page.getByLabel("Title", { exact: true });
  const form = page.locator("form").filter({ has: title });
  const save = form.getByRole("button", { name: "Save changes", exact: true });
  await title.fill(" ");
  await save.click();
  const error = form.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await page.clock.install();
  await page.clock.fastForward(30000);
  await expect(error).toBeVisible();
  await expect(
    error.getByRole("button", { name: "Dismiss confirmation" }),
  ).toHaveCount(0);
  await title.fill("A saved list");
  await save.click();
  const success = page.getByRole("status", { name: "Save confirmation" });
  await expect(success).toContainText("Changes saved.");
  await expect(error).toHaveCount(0);
  await expect(form.getByRole("status")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 420 });
  await save.evaluate((button) => button.scrollIntoView({ block: "end" }));
  await save.focus();
  await expect
    .poll(async () => {
      const control = (await save.boundingBox())!;
      const toast = (await success.boundingBox())!;
      return (
        control.y + control.height <= toast.y ||
        control.y >= toast.y + toast.height
      );
    })
    .toBe(true);
  const dismiss = success.getByRole("button", { name: "Dismiss confirmation" });
  await save.focus();
  await dismiss.focus();
  await dismiss.press("Enter");
  await expect(success).toHaveCount(0);
  await expect(save).toBeFocused();
  await expect(title).toHaveValue("A saved list");
  await save.click();
  await expect(success).toContainText("Changes saved.");
  await page.mouse.move(0, 0);
  await page.clock.fastForward(9000);
  await expect(success).toHaveCount(0);
  await expect(title).toHaveValue("A saved list");
});

test("navigation clears old confirmations and does not pause the next one", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(path);
  await page.clock.install();
  await page.getByRole("button", { name: "Hide list", exact: true }).click();
  const toast = page.getByRole("status", { name: "Save confirmation" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Dismiss confirmation" }).focus();
  await page
    .getByRole("link", { name: "Back to my lists", exact: true })
    .click();
  await expect(page).toHaveURL(/\/lists$/);
  await expect(toast).toHaveCount(0);
  await page.goBack();
  const db = testPrisma();
  try {
    await db.wishlist.update({
      where: { id: "e2e-feedback" },
      data: { publication: "PUBLISHED" },
    });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await page.getByRole("button", { name: "Hide list", exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(toast).toContainText("List hidden from viewers.");
  await page.clock.fastForward(9000);
  await expect(toast).toHaveCount(0);
});
