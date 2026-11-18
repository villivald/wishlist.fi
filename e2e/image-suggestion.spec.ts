import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { prepareImage } from "../src/features/media/service/validation";
import { testOrigin } from "./environment";
import { expectImageLoaded } from "./image-assertions";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-image-suggestion-list";
const createUrl = `/en/lists/${listId}/wishes/new`;
const productUrl = "https://shop.example/camera";
const image = () =>
  sharp({
    create: { width: 600, height: 400, channels: 3, background: "#467cb0" },
  })
    .webp()
    .toBuffer();

const signIn = async (page: Page) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await page.goto(createUrl);
};

test.beforeEach(async () => {
  await resetFixtures();
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: listId,
        title: "Image suggestions",
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("automatically suggests an image, requires acceptance, preserves it on validation and saves it", async ({
  page,
}, info) => {
  const body = await image();
  await page.route("**/api/media/suggestion", (route) =>
    route.fulfill({ contentType: "image/webp", body }),
  );
  await signIn(page);
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(productUrl);
  const preview = page.getByRole("img", { name: "Suggested product image" });
  await expect(preview).toBeVisible();
  await expectImageLoaded(preview);
  await page
    .getByRole("region", { name: "Image from product link" })
    .screenshot({ path: info.outputPath("image-suggestion.png") });
  const upload = page.getByLabel("Image (optional)", { exact: true });
  await expect(upload).toHaveValue("");
  await page
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Selected image", exact: true }),
  ).toBeFocused();
  await expect(upload).toHaveValue(/product-image\.webp$/);
  await page.getByLabel("Title", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page.getByText("Enter a title", { exact: true })).toBeVisible();
  await expect(upload).toHaveValue(/product-image\.webp$/);
  await expectImageLoaded(
    page.getByRole("img", { name: "Selected image preview" }),
  );
  await page.getByLabel("Title", { exact: true }).fill("Imported camera");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
  await expectImageLoaded(
    page.getByRole("img", { name: "Imported camera", exact: true }),
  );
});

const createExistingWish = async (withImage = true) => {
  const prisma = testPrisma();
  try {
    const wish = await prisma.wish.create({
      data: {
        wishlistId: listId,
        title: "Existing camera",
        externalUrl: productUrl,
        authorId: "e2e-owner",
      },
    });
    if (withImage) {
      const { replaceImage } =
        await import("../src/features/media/service/media");
      await replaceImage(
        "e2e-owner",
        { kind: "wish", listId, wishId: wish.id },
        "Existing camera image",
        await image(),
      );
    }
    return wish;
  } finally {
    await prisma.$disconnect();
  }
};

test("image loading keeps preview geometry stable and the chooser remains keyboard friendly", async ({
  page,
}, info) => {
  const wish = await createExistingWish();
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const body = await image();
  await page.route("**/api/media/suggestion", async (route) => {
    await waiting;
    await route.fulfill({ contentType: "image/webp", body });
  });
  await signIn(page);
  const lookup = page.waitForRequest("**/api/media/suggestion");
  await page.goto(`/en/lists/${listId}/wishes/${wish.id}/edit`);
  await lookup;
  try {
    const suggestion = page.getByRole("region", {
      name: "Image from product link",
      exact: true,
    });
    const frame = suggestion.locator("[data-loading]");
    await expect(
      suggestion.getByRole("button", { name: "Use this image", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    const loading = await frame.boundingBox();
    const loadingTop = await frame.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    );
    expect(loading!.height).toBeGreaterThan(100);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await frame
        .locator("svg")
        .last()
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe("none");
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
    await page
      .getByRole("main")
      .screenshot({ path: info.outputPath("image-panel-loading.png") });
    release?.();
    await expect(
      suggestion.getByRole("button", { name: "Use this image", exact: true }),
    ).toBeEnabled();
    const ready = await frame.boundingBox();
    expect(ready!.height).toBeCloseTo(loading!.height, 0);
    const readyTop = await frame.evaluate(
      (element) => element.getBoundingClientRect().top + scrollY,
    );
    expect(readyTop).toBeCloseTo(loadingTop, 0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      await page.getByRole("main").screenshot({
        path: info.outputPath(`image-panel-ready-${theme}.png`),
      });
    }
    await suggestion
      .getByRole("button", { name: "Use this image", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Selected image", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("main")
      .screenshot({ path: info.outputPath("image-panel-selected.png") });
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Choose image", exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: "my-camera.webp",
      mimeType: "image/webp",
      buffer: body,
    });
    await expect(
      page.getByText("my-camera.webp", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Selected image", exact: true }),
    ).toBeFocused();
  } finally {
    release?.();
  }
});

test("editing stages a link image until Save changes, preserving it after validation errors", async ({
  page,
}) => {
  const wish = await createExistingWish();
  const prisma = testPrisma();
  try {
    const original = await prisma.media.findFirstOrThrow({
      where: { wishId: wish.id },
    });
    await page.route("**/api/media/suggestion", async (route) =>
      route.fulfill({ contentType: "image/webp", body: await image() }),
    );
    await signIn(page);
    await page.goto(`/en/lists/${listId}/wishes/${wish.id}/edit`);
    await page
      .getByRole("textbox", { name: "Product link (optional)", exact: true })
      .fill("https://shop.example/new-camera");
    await page
      .getByRole("button", { name: "Use this image", exact: true })
      .click();
    await expect(
      page.getByText(
        "The selected image will replace the current one when you save changes.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await page.getByLabel("Title", { exact: true }).fill("   ");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Enter a title", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Image (optional)", { exact: true }),
    ).toHaveValue(/product-image\.webp$/);
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await page.getByLabel("Title", { exact: true }).fill("Replaced camera");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/wishes/${wish.id}$`));
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).not.toBe(original.id);
    expect(
      (await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } }))
        .externalUrl,
    ).toBe("https://shop.example/new-camera");
    expect(
      (await prisma.media.findUniqueOrThrow({ where: { id: original.id } }))
        .wishId,
    ).toBeNull();
  } finally {
    await prisma.$disconnect();
  }
});

test("editing can keep the current image, discard a replacement, and undo or save removal", async ({
  page,
}) => {
  const wish = await createExistingWish();
  const prisma = testPrisma();
  const editUrl = `/en/lists/${listId}/wishes/${wish.id}/edit`;
  try {
    const original = await prisma.media.findFirstOrThrow({
      where: { wishId: wish.id },
    });
    await page.route("**/api/media/suggestion", async (route) =>
      route.fulfill({ contentType: "image/webp", body: await image() }),
    );
    await signIn(page);
    await page.goto(editUrl);
    await page
      .getByRole("textbox", { name: "Product link (optional)", exact: true })
      .fill("https://shop.example/changed-link");
    await page
      .getByRole("button", { name: "Use this image", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Remove selected image", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/wishes/${wish.id}$`));
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await page.goto(editUrl);
    await page
      .getByRole("button", { name: "Remove image", exact: true })
      .click();
    await expect(
      page.getByText(
        "The current image will be removed when you save changes.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await page
      .getByRole("button", { name: "Keep current image", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/wishes/${wish.id}$`));
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await page.goto(editUrl);
    await page
      .getByRole("button", { name: "Remove image", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/wishes/${wish.id}$`));
    expect(await prisma.media.count({ where: { wishId: wish.id } })).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("editing adds a link image to a wish without an existing image", async ({
  page,
}) => {
  const wish = await createExistingWish(false);
  await page.route("**/api/media/suggestion", async (route) =>
    route.fulfill({ contentType: "image/webp", body: await image() }),
  );
  await signIn(page);
  await page.goto(`/en/lists/${listId}/wishes/${wish.id}/edit`);
  await page
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/wishes/${wish.id}$`));
  await expectImageLoaded(
    page.getByRole("img", { name: "Existing camera", exact: true }),
  );
});

test("switching languages warns before discarding a selected or removed image", async ({
  page,
}) => {
  const wish = await createExistingWish();
  const editUrl = `/en/lists/${listId}/wishes/${wish.id}/edit`;
  await page.route("**/api/media/suggestion", async (route) =>
    route.fulfill({ contentType: "image/webp", body: await image() }),
  );
  await signIn(page);
  await page.goto(editUrl);
  await page
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  const warnings: string[] = [];
  page.on("dialog", async (dialog) => {
    warnings.push(dialog.message());
    await dialog.dismiss();
  });
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fi");
  await expect.poll(() => warnings.length).toBe(1);
  expect(warnings[0]).toBe(
    "You have unsaved changes. Switch language and discard them?",
  );
  await expect(page).toHaveURL(editUrl);
  await expect(
    page.getByRole("heading", { name: "Selected image", exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Language", exact: true })
    .selectOption("fi");
  await expect.poll(() => warnings.length).toBe(2);
  await expect(page).toHaveURL(editUrl);
  await expect(
    page.getByRole("button", { name: "Keep current image", exact: true }),
  ).toBeVisible();
});

test("cancelling an edit discards the selected image and changed product link", async ({
  page,
}) => {
  const wish = await createExistingWish();
  const prisma = testPrisma();
  try {
    const original = await prisma.media.findFirstOrThrow({
      where: { wishId: wish.id },
    });
    await page.route("**/api/media/suggestion", async (route) =>
      route.fulfill({ contentType: "image/webp", body: await image() }),
    );
    await signIn(page);
    await page.goto(`/en/lists/${listId}/wishes/${wish.id}/edit`);
    await page
      .getByRole("textbox", { name: "Product link (optional)", exact: true })
      .fill("https://shop.example/cancelled");
    await page
      .getByRole("button", { name: "Use this image", exact: true })
      .click();
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/wishes/${wish.id}$`));
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    expect(
      (await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } }))
        .externalUrl,
    ).toBe(productUrl);
  } finally {
    await prisma.$disconnect();
  }
});

test("edit image choices fit both languages and themes at 320px with enlarged text", async ({
  page,
}, info) => {
  const wish = await createExistingWish();
  await page.route("**/api/media/suggestion", async (route) =>
    route.fulfill({ contentType: "image/webp", body: await image() }),
  );
  await signIn(page);
  for (const locale of ["en", "fi"]) {
    await page.goto(`/${locale}/lists/${listId}/wishes/${wish.id}/edit`);
    await page.setViewportSize({ width: 320, height: 700 });
    await expect(
      page.getByRole("heading", {
        name: locale === "en" ? "Image (optional)" : "Kuva (valinnainen)",
        exact: true,
      }),
    ).toBeVisible();
    const useImage = page.getByRole("button", {
      name: locale === "en" ? "Use this image" : "Käytä tätä kuvaa",
      exact: true,
    });
    await expect(useImage).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) =>
          document.documentElement.classList.toggle("dark", value === "dark"),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
      await page
        .getByRole("group", {
          name: locale === "en" ? "Wish image" : "Toiveen kuva",
          exact: true,
        })
        .screenshot({
          path: info.outputPath(`edit-images-${locale}-${theme}.png`),
        });
    }
    await useImage.click();
    await expect(
      page.getByRole("heading", {
        name: locale === "en" ? "Selected image" : "Valittu kuva",
        exact: true,
      }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("JPEG imports use the normal encoder exactly once and generate the normal variants", async ({
  page,
}) => {
  const source = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: "#467cb0" },
  })
    .withMetadata()
    .jpeg()
    .toBuffer();
  await page.route("**/api/media/suggestion", (route) =>
    route.fulfill({ contentType: "image/jpeg", body: source }),
  );
  await signIn(page);
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(productUrl);
  await page
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  await expect(
    page.getByLabel("Image (optional)", { exact: true }),
  ).toHaveValue(/product-image\.jpg$/);
  await page.getByLabel("Title", { exact: true }).fill("Single encode camera");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
  const prisma = testPrisma();
  try {
    const media = await prisma.media.findFirstOrThrow({
      where: { wish: { wishlistId: listId, title: "Single encode camera" } },
    });
    expect(media).toMatchObject({
      width: 1600,
      height: 1067,
      variantWidths: [200, 400, 800, 1200],
    });
    const bytes = await page.evaluate(
      async (id) => [
        ...new Uint8Array(
          await (await fetch(`/api/media/${id}`)).arrayBuffer(),
        ),
      ],
      media.id,
    );
    expect(
      Buffer.from(bytes).equals((await prepareImage(source, false)).data),
    ).toBe(true);
    expect((await sharp(Buffer.from(bytes)).metadata()).exif).toBeUndefined();
  } finally {
    await prisma.$disconnect();
  }
});

test("retry respects the shop delay and a removed selection does not trigger another lookup", async ({
  page,
}) => {
  let requests = 0;
  const body = await image();
  await page.route("**/api/media/suggestion", (route) => {
    requests += 1;
    return requests === 1
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ reason: "blocked", retryAfter: "2" }),
        })
      : route.fulfill({ contentType: "image/webp", body });
  });
  await signIn(page);
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(productUrl);
  const retry = page.getByRole("button", { name: /^Try again/ });
  await expect(retry).toBeDisabled();
  await expect(retry).toBeEnabled();
  await retry.click();
  await page
    .getByRole("button", { name: "Use this image", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove selected image", exact: true })
    .click();
  await expect(
    page.getByLabel("Image (optional)", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(`${productUrl}#details`);
  await expect(
    page.getByRole("region", { name: "Image from product link" }),
  ).toHaveCount(0);
  expect(requests).toBe(2);
});

test("dismissing a suggestion still allows saving without an image", async ({
  page,
}) => {
  await page.route("**/api/media/suggestion", async (route) =>
    route.fulfill({ contentType: "image/webp", body: await image() }),
  );
  await signIn(page);
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(productUrl);
  await expect(
    page.getByRole("button", { name: "Use this image", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Choose image", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("img", { name: "Suggested product image" }),
  ).toHaveCount(0);
  await page.getByLabel("Title", { exact: true }).fill("Camera without image");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
  const prisma = testPrisma();
  try {
    expect(
      await prisma.media.count({ where: { wish: { wishlistId: listId } } }),
    ).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
});

test("a delayed lookup cannot override a manual upload or a changed link", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const body = await image();
  await page.route("**/api/media/suggestion", async (route) => {
    if (route.request().postDataJSON().url === productUrl) await waiting;
    await route.fulfill({ contentType: "image/webp", body }).catch(() => {});
  });
  await signIn(page);
  const firstRequest = page.waitForRequest("**/api/media/suggestion");
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(productUrl);
  await firstRequest;
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill("https://shop.example/other");
  await expect(
    page.getByRole("button", { name: "Use this image", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Image (optional)", { exact: true }).setInputFiles({
    name: "my-photo.webp",
    mimeType: "image/webp",
    buffer: body,
  });
  release?.();
  await expect(
    page.getByLabel("Image (optional)", { exact: true }),
  ).toHaveValue(/my-photo\.webp$/);
  await expect(
    page.getByRole("button", { name: "Use this image", exact: true }),
  ).toHaveCount(0);
});

test("no image or a failed lookup leaves manual uploads and saving available", async ({
  page,
}) => {
  await page.route("**/api/media/suggestion", (route) =>
    route.fulfill({ status: 204 }),
  );
  await signIn(page);
  await page
    .getByRole("textbox", { name: "Product link (optional)", exact: true })
    .fill(productUrl);
  await expect(
    page.getByText(
      "No image found. You can upload your own or continue without one.",
    ),
  ).toBeVisible();
  await page.getByLabel("Image (optional)", { exact: true }).setInputFiles({
    name: "manual.webp",
    mimeType: "image/webp",
    buffer: await image(),
  });
  await page.getByLabel("Title", { exact: true }).fill("Manual camera");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
  await expectImageLoaded(
    page.getByRole("img", { name: "Manual camera", exact: true }),
  );
});

test("lookup failures explain the cause and still allow saving without an image", async ({
  page,
}) => {
  let reason = "blocked";
  let status = 200;
  await page.route("**/api/media/suggestion", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ reason }),
    }),
  );
  await signIn(page);
  const cases = [
    [
      "blocked",
      200,
      "This shop did not allow an image preview. You can upload your own or continue without one.",
    ],
    [
      "unavailable",
      200,
      "The image could not be loaded. You can upload your own or continue without one.",
    ],
    [
      "rate_limited",
      429,
      "Image lookup is temporarily limited. You can upload your own or try again later.",
    ],
  ] as const;
  for (const [nextReason, nextStatus, message] of cases) {
    reason = nextReason;
    status = nextStatus;
    await page
      .getByRole("textbox", { name: "Product link (optional)", exact: true })
      .fill(`${productUrl}?case=${reason}`);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Image (optional)", { exact: true }),
    ).toHaveValue("");
  }
  await page
    .getByLabel("Title", { exact: true })
    .fill("Camera after failed preview");
  await page.getByRole("button", { name: "Add wish", exact: true }).click();
  await expect(page).toHaveURL(/\/wishes\/(?!new$)[^/?]+$/);
});

test("Finnish suggestions fit narrow screens in both themes with enlarged text", async ({
  page,
}, info) => {
  await page.route("**/api/media/suggestion", async (route) =>
    route.fulfill({ contentType: "image/webp", body: await image() }),
  );
  await signIn(page);
  await page.goto(createUrl.replace("/en/", "/fi/"));
  await page.setViewportSize({ width: 320, height: 700 });
  await page
    .getByRole("textbox", { name: "Tuotelinkki (valinnainen)", exact: true })
    .fill(productUrl);
  await expect(
    page.getByRole("button", { name: "Käytä tätä kuvaa", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.evaluate(
      (value) =>
        document.documentElement.classList.toggle("dark", value === "dark"),
      theme,
    );
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.right > innerWidth + 1;
          })
          .map((element) => ({
            tag: element.tagName,
            className: element.className,
            text: element.textContent?.slice(0, 60),
            right: element.getBoundingClientRect().right,
          })),
      ),
    ).toEqual([]);
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`suggestion-fi-${theme}.png`),
      fullPage: true,
    });
    await page.getByRole("region", { name: "Kuva linkistä" }).screenshot({
      path: info.outputPath(`suggestion-panel-fi-${theme}.png`),
    });
  }
});

test("suggestion API enforces origin, verified sign-in, list access, request size and public addresses", async ({
  page,
  request,
}) => {
  const endpoint = "/api/media/suggestion";
  const data = { listId, url: productUrl };
  const authenticatedPost = (body: typeof data) =>
    page.evaluate(async (input) => {
      const response = await fetch("/api/media/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      return response.status;
    }, body);
  expect(
    (
      await request.post(endpoint, { data, headers: { Origin: testOrigin } })
    ).status(),
  ).toBe(401);
  await signIn(page);
  expect(
    (
      await page.request.post(endpoint, {
        data,
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  expect(await authenticatedPost({ ...data, listId: "e2e-private-list" })).toBe(
    403,
  );
  expect(
    await authenticatedPost({ ...data, url: "http://127.0.0.1/private" }),
  ).toBe(422);
  expect(await authenticatedPost({ ...data, url: "x".repeat(5000) })).toBe(413);
  const prisma = testPrisma();
  try {
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { emailVerified: false },
    });
    expect(await authenticatedPost(data)).toBe(401);
  } finally {
    await prisma.$disconnect();
  }
});
