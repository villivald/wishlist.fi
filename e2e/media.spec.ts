import { expect, type Page, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { expectImageLoaded } from "./image-assertions";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listUrl = "/en/lists/e2e-media-list";
const wishUrl = `${listUrl}/wishes/e2e-media-wish`;
const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

const upload = async (page: Page, description: string, replacement = false) => {
  const editingWish = new URL(page.url()).pathname.includes("/wishes/");
  const buffer = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#467cb0" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer });
  await page
    .getByLabel(
      editingWish ? "Image description (optional)" : "Image description",
      { exact: true },
    )
    .fill(description);
  await page
    .getByRole("button", {
      name: editingWish
        ? "Save changes"
        : replacement
          ? "Replace image"
          : "Upload image",
      exact: true,
    })
    .click();
  if (editingWish) await expect(page).not.toHaveURL(/\/edit(?:\?|$)/);
  else
    await expect(
      page.getByRole("status", { name: "Save confirmation" }),
    ).toHaveText("Image saved.");
  const image = page.getByRole("img", { name: description, exact: true });
  await expect(image).toBeVisible();
  await expectImageLoaded(image);
  return (await image.getAttribute("src"))!;
};

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: "e2e-media-list",
        title: "Image test list",
        publication: "PUBLISHED",
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        wishes: {
          create: {
            id: "e2e-media-wish",
            title: "A camera",
            authorId: "e2e-owner",
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("wish creation previews an image, keeps it after validation and saves it with the wish", async ({
  page,
  request,
}, info) => {
  await signIn(page);
  await page.goto(`${listUrl}/wishes/new`);
  const buffer = await sharp(randomBytes(900 * 600 * 3), {
    raw: { width: 900, height: 600, channels: 3 },
  })
    .png()
    .toBuffer();
  expect(buffer.length).toBeGreaterThan(1024 * 1024);
  await expect(
    page.getByLabel("Image (optional)", { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Image (optional)", { exact: true }).setInputFiles({
    name: "camera.png",
    mimeType: "image/png",
    buffer,
  });
  await page
    .getByLabel("Image description (optional)", { exact: true })
    .fill("A blue camera for trips");
  await expect(
    page.getByRole("img", { name: "A blue camera for trips" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove selected image" }).click();
  await expect(
    page.getByRole("img", { name: "A blue camera for trips" }),
  ).not.toBeVisible();
  await page
    .getByLabel("Image (optional)", { exact: true })
    .setInputFiles({ name: "camera.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Image description (optional)", { exact: true })
    .fill("A blue camera for trips");
  await page.getByLabel("Title", { exact: true }).fill("   ");
  await page
    .getByLabel("Description (optional)", { exact: true })
    .fill("For our next adventure.");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page.getByText("Enter a title", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Image (optional)", { exact: true }),
  ).toHaveValue(/camera\.png$/);
  await expect(
    page.getByLabel("Description (optional)", { exact: true }),
  ).toHaveValue("For our next adventure.");
  await expect(
    page.getByLabel("Image description (optional)", { exact: true }),
  ).toHaveValue("A blue camera for trips");
  await expect(
    page.getByRole("img", { name: "A blue camera for trips" }),
  ).toBeVisible();
  if (info.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: "dark" });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("wish-image-creation.png"),
    fullPage: true,
  });
  await page.getByLabel("Title", { exact: true }).fill("A travel camera");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
  const image = page.getByRole("img", { name: "A blue camera for trips" });
  await expect(image).toBeVisible();
  await expectImageLoaded(image);
  expect((await request.get((await image.getAttribute("src"))!)).status()).toBe(
    200,
  );
  const prisma = testPrisma();
  try {
    expect(
      await prisma.wish.count({
        where: { wishlistId: "e2e-media-list", title: "A travel camera" },
      }),
    ).toBe(1);
  } finally {
    await prisma.$disconnect();
  }
});

test("invalid creation images do not create wishes, and image description can fall back to the title", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${listUrl}/wishes/new`);
  await page.getByLabel("Title", { exact: true }).fill("A new camera");
  await expect(
    page.getByLabel("Image (optional)", { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Image (optional)", { exact: true }).setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "valid, still JPEG",
  );
  await expect(page.getByRole("main").getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "A new camera",
  );
  const prisma = testPrisma();
  try {
    expect(
      await prisma.wish.count({
        where: { wishlistId: "e2e-media-list", title: "A new camera" },
      }),
    ).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
  await page.getByLabel("Image (optional)", { exact: true }).setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(3 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText("Choose an image up to 3 MB.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove selected image" }).click();
  const buffer = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Image (optional)", { exact: true })
    .setInputFiles({ name: "camera.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
  await expect(
    page.getByRole("img", { name: "A new camera", exact: true }),
  ).toBeVisible();
});

test("wish image editing uses the wish title when its image description is blank", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`${wishUrl}/edit`);
  const buffer = await sharp({
    create: { width: 80, height: 40, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await page.locator('input[type="file"]').setInputFiles({
    name: "camera.png",
    mimeType: "image/png",
    buffer,
  });
  const description = page.getByLabel("Image description (optional)", {
    exact: true,
  });
  await expect(description).not.toHaveAttribute("required");
  await description.fill("   ");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(wishUrl);
  await expect(
    page.getByRole("img", { name: "A camera", exact: true }),
  ).toBeVisible();
});

test("list image upload, replacement, removal and revocation work through the UI", async ({
  page,
  request,
}, testInfo) => {
  await signIn(page);
  await page.goto(`${listUrl}/edit`);
  const first = await upload(page, "A blue landscape");
  expect((await request.get(first)).status()).toBe(200);
  const second = await upload(page, "A second blue landscape", true);
  expect(second).not.toBe(first);
  expect((await request.get(first)).status()).toBe(404);
  await page.screenshot({
    path: testInfo.outputPath("image-editor.png"),
    fullPage: true,
  });
  if (testInfo.project.name === "mobile-chromium") {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("image-editor-narrow-dark.png"),
      fullPage: true,
    });
  }
  await page.goto(listUrl);
  await expectImageLoaded(
    page.getByRole("img", { name: "A second blue landscape" }),
  );
  const cover = await page
    .getByRole("img", { name: "A second blue landscape" })
    .boundingBox();
  expect(cover?.width).toBeLessThanOrEqual(144);
  expect(cover?.height).toBeLessThanOrEqual(108);
  if ((page.viewportSize()?.width ?? 0) >= 760) {
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(title!.x).toBeGreaterThanOrEqual(cover!.x + cover!.width);
    expect(title!.y).toBeLessThan(cover!.y + cover!.height);
  }
  await page.screenshot({
    path: testInfo.outputPath("compact-list-cover.png"),
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hide list", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "List access", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "List visibility", exact: true }),
  ).toContainText("Hidden · Admins only");
  const revoked = await request.get(second, {
    headers: { "If-None-Match": '"old"' },
  });
  expect(revoked.status()).toBe(404);
  expect(revoked.headers()["cache-control"]).toContain("no-store");
  await page.goto(`${listUrl}/edit`);
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Save confirmation" }),
  ).toHaveText("Image removed.");
  await expect(
    page.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async (src) => (await fetch(src)).status, second),
  ).toBe(404);
});

test("wish images reject malformed files, survive errors and follow hidden access", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto(`${wishUrl}/edit`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await page
    .getByLabel("Image description (optional)", { exact: true })
    .fill("A fake image");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const error = page.getByRole("main").getByRole("alert");
  await expect(error).toContainText("valid, still JPEG");
  await expect(error).toBeFocused();
  const src = await upload(page, "A camera on a blue background");
  expect((await request.get(src)).status()).toBe(200);
  await page.goto(listUrl);
  await expect(
    page.getByRole("img", { name: "A camera on a blue background" }),
  ).toBeVisible();
  await page.goto(wishUrl);
  await page.getByRole("button", { name: "Hide wish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show wish", exact: true }),
  ).toBeVisible();
  expect((await request.get(src)).status()).toBe(404);
  expect(
    await page.evaluate(async (url) => (await fetch(url)).status, src),
  ).toBe(200);
  await page.goto(`${wishUrl}/edit`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(3 * 1024 * 1024 + 1),
  });
  await expect(
    page.getByText("Choose an image up to 3 MB.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "A camera on a blue background" }),
  ).toBeVisible();
});

test("avatars are public only for public list owners, resized and removable", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/en/account/profile");
  const buffer = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#467cb0" },
  })
    .png()
    .toBuffer();
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer });
  await page
    .getByLabel("Image description", { exact: true })
    .fill("My portrait");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  const avatar = page
    .getByRole("main")
    .getByRole("img", { name: "My portrait" });
  await expectImageLoaded(avatar);
  const src = (await avatar.getAttribute("src"))!;
  expect((await request.get(src)).status()).toBe(200);
  const prisma = testPrisma();
  try {
    await prisma.wishlist.update({
      where: { id: "e2e-media-list" },
      data: { publication: "DRAFT" },
    });
  } finally {
    await prisma.$disconnect();
  }
  expect((await request.get(src)).status()).toBe(404);
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeVisible();
  await expect(avatar).toHaveCount(0);
});

test("card previews choose private variants and revoke them after hiding", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto(`${wishUrl}/edit`);
  const src = await upload(page, "Responsive camera");
  const original = await request.get(src);
  expect(await sharp(await original.body()).metadata()).toMatchObject({
    width: 900,
  });
  await page.goto("/en/lists");
  const preview = page
    .getByRole("main")
    .getByRole("img", { name: "Responsive camera" });
  await expectImageLoaded(preview);
  const selected = await preview.evaluate(
    (element: HTMLImageElement) => element.currentSrc,
  );
  const width = Number(new URL(selected).searchParams.get("w"));
  expect([200, 400, 800]).toContain(width);
  const response = await request.get(selected);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await sharp(await response.body()).metadata()).toMatchObject({
    width,
  });
  await page.goto(wishUrl);
  await page.getByRole("button", { name: "Hide wish", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show wish", exact: true }),
  ).toBeVisible();
  expect((await request.get(selected)).status()).toBe(404);
  expect(
    await page.evaluate(async (url) => (await fetch(url)).status, selected),
  ).toBe(200);
});
