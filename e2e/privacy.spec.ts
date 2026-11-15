import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { accounts, resetFixtures } from "./seed";

const advertisingEnabled = () =>
  test.info().config.metadata.advertisingEnabled === true;

const installTrackingStubs = async (page: Page) => {
  const googleRequests: string[] = [];
  const vercelRequests: string[] = [];
  await page.route("https://www.googletagmanager.com/**", (route) => {
    googleRequests.push(route.request().url());
    return route.fulfill({
      contentType: "application/javascript",
      body: "window.__googleTagLoaded = true;",
    });
  });
  await page.route("**/_vercel/**", (route) => {
    vercelRequests.push(route.request().url());
    return route.fulfill({ contentType: "application/javascript", body: "" });
  });
  return { googleRequests, vercelRequests };
};

test("nothing loads before consent; choices isolate services and withdrawal unloads them", async ({
  page,
}) => {
  const requests = await installTrackingStubs(page);
  await page.goto("/en/premium");
  const notice = page.getByRole("region", { name: "Your privacy choices" });
  await expect(notice).toBeVisible();
  expect(requests.googleRequests).toEqual([]);
  expect(requests.vercelRequests).toEqual([]);
  await notice
    .getByRole("button", { name: "Cookie settings", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Cookie settings" });
  await dialog.getByRole("checkbox", { name: /^Analytics/ }).check();
  await dialog.getByRole("button", { name: "Save cookie choices" }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => requests.vercelRequests.length).toBeGreaterThan(0);
  expect(requests.googleRequests).toEqual([]);

  await page
    .getByRole("button", { name: "Cookie settings", exact: true })
    .click();
  await dialog.getByRole("checkbox", { name: /^Analytics/ }).uncheck();
  if (!advertisingEnabled()) {
    await expect(
      dialog.getByRole("checkbox", { name: /^Advertising/ }),
    ).toHaveCount(0);
    await dialog.getByRole("button", { name: "Save cookie choices" }).click();
    await expect(dialog).not.toBeVisible();
    expect(requests.googleRequests).toEqual([]);
    await expect(page.locator("script[src*='/_vercel/']")).toHaveCount(0);
    return;
  }
  await dialog.getByRole("checkbox", { name: /^Advertising/ }).check();
  await dialog.getByRole("button", { name: "Save cookie choices" }).click();
  await expect.poll(() => requests.googleRequests.length).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __googleTagLoaded?: boolean }).__googleTagLoaded,
    ),
  ).toBe(true);

  // Consent continues to apply when moving from information pages into the app.
  const documentId = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __googleTagLoaded?: boolean }).__googleTagLoaded,
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/premium$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
  await page
    .getByRole("button", { name: "Cookie settings", exact: true })
    .click();
  await dialog.getByRole("checkbox", { name: /^Advertising/ }).uncheck();
  await page.evaluate(() => {
    document.cookie = "_gcl_au=test-ad-cookie; Path=/";
  });
  await dialog.getByRole("button", { name: "Save cookie choices" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __googleTagLoaded?: boolean }).__googleTagLoaded,
    ),
  ).toBeUndefined();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "_gcl_au",
    ),
  ).toBe(false);
});

test("app pages offer consent and keep essential-only tracking disabled", async ({
  page,
}) => {
  const requests = await installTrackingStubs(page);
  await page.goto("/en/sign-in");
  const notice = page.getByRole("region", { name: "Your privacy choices" });
  await expect(notice).toBeVisible();
  await notice
    .getByRole("button", { name: "Essential only", exact: true })
    .click();
  await expect(notice).toHaveCount(0);
  await page.goto("/fi/guest");
  await expect(
    page.getByRole("region", { name: "Yksityisyysvalintasi" }),
  ).toHaveCount(0);
  expect(requests.googleRequests).toEqual([]);
  expect(requests.vercelRequests).toEqual([]);
});

test("saved consent loads only enabled services across languages and route groups", async ({
  page,
  context,
}) => {
  const requests = await installTrackingStubs(page);
  await context.addCookies([
    {
      name: "wishlist-privacy",
      value: "v1.a1.m1",
      url: "http://127.0.0.1:3017",
    },
    ...["_ga", "_gcl_au"].map((name) => ({
      name,
      value: "old-google-cookie",
      url: "http://127.0.0.1:3017",
    })),
  ]);
  for (const path of [
    "/en",
    "/fi/premium",
    "/en/privacy",
    "/fi/guest#private-secret",
    "/en/password-reset/private-secret",
    "/fi/invitations/private-secret",
    "/en/sign-in",
    "/fi/browse",
    "/en/account/checkout",
  ]) {
    const googleCount = requests.googleRequests.length;
    const vercelCount = requests.vercelRequests.length;
    await page.goto(path);
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator("#google-tag-manager-init"), path).toHaveCount(
      advertisingEnabled() ? 1 : 0,
    );
    await expect
      .poll(() => requests.googleRequests.length, { message: path })
      .toBe(googleCount + Number(advertisingEnabled()));
    await expect
      .poll(() => requests.vercelRequests.length, { message: path })
      .toBe(vercelCount + 2);
    if (!advertisingEnabled()) {
      await expect
        .poll(async () =>
          (await context.cookies()).filter(({ name }) =>
            ["_ga", "_gcl_au"].includes(name),
          ),
        )
        .toEqual([]);
    }
  }
});

test("unknown nested URLs retain localized error pages and consented tracking", async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: "wishlist-privacy",
      value: "v1.a1.m1",
      url: "http://127.0.0.1:3017",
    },
  ]);
  const requests = await installTrackingStubs(page);
  const response = await page.goto("/fi/no-such-page/nested");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Sivua ei löytynyt" }),
  ).toBeVisible();
  await expect
    .poll(() => requests.googleRequests.length)
    .toBe(Number(advertisingEnabled()));
  await expect.poll(() => requests.vercelRequests.length).toBe(2);
});

test("consented tracking survives sign-in, information-page navigation, and sign-out", async ({
  page,
  context,
}) => {
  await resetFixtures();
  const requests = await installTrackingStubs(page);
  await context.addCookies([
    {
      name: "wishlist-privacy",
      value: "v1.a1.m1",
      url: "http://127.0.0.1:3017",
    },
  ]);
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/lists$/);
  await expect
    .poll(() => requests.googleRequests.length)
    .toBe(Number(advertisingEnabled()));
  await expect.poll(() => requests.vercelRequests.length).toBe(2);
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Free and Premium", exact: true })
    .click();
  await expect
    .poll(() => requests.googleRequests.length)
    .toBe(Number(advertisingEnabled()));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/sign-in$/);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __googleTagLoaded?: boolean }).__googleTagLoaded,
    ),
  ).toBe(advertisingEnabled() ? true : undefined);
});

test("notice, settings, allow-all consent and privacy copy match available services", async ({
  page,
  context,
}) => {
  const requests = await installTrackingStubs(page);
  for (const locale of ["en", "fi"]) {
    await context.clearCookies();
    await page.goto(`/${locale}/privacy`);
    const notice = page.getByRole("region", {
      name: locale === "en" ? "Your privacy choices" : "Yksityisyysvalintasi",
    });
    await expect(notice).toBeVisible();
    const disabledCopy = page.getByText(
      locale === "en"
        ? "Google advertising tracking is currently disabled."
        : "Googlen mainonnan seuranta ei ole tällä hetkellä käytössä.",
      { exact: false },
    );
    await expect(disabledCopy).toHaveCount(advertisingEnabled() ? 0 : 1);
    if (!advertisingEnabled()) await expect(notice).not.toContainText("Google");
    await notice
      .getByRole("button", {
        name: locale === "en" ? "Cookie settings" : "Evästeasetukset",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox")).toHaveCount(
      advertisingEnabled() ? 2 : 1,
    );
    await page.keyboard.press("Escape");
    await notice
      .getByRole("button", {
        name: locale === "en" ? "Allow all" : "Salli kaikki",
        exact: true,
      })
      .click();
    await expect(notice).toHaveCount(0);
    expect(
      (await context.cookies()).find(({ name }) => name === "wishlist-privacy")
        ?.value,
    ).toBe(`v1.a1.m${Number(advertisingEnabled())}`);
    await expect.poll(() => requests.vercelRequests.length).toBeGreaterThan(0);
    if (!advertisingEnabled()) expect(requests.googleRequests).toEqual([]);
  }
});

test("browser privacy signals override saved consent", async ({
  page,
  context,
}) => {
  const requests = await installTrackingStubs(page);
  await context.addCookies([
    {
      name: "wishlist-privacy",
      value: "v1.a1.m1",
      url: "http://127.0.0.1:3017",
    },
  ]);
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true }),
  );
  await page.goto("/en/premium");
  await page
    .getByRole("button", { name: "Cookie settings", exact: true })
    .click();
  await expect(
    page.getByText("Your browser’s privacy signal blocks optional tracking."),
  ).toBeVisible();
  expect(requests.googleRequests).toEqual([]);
  expect(requests.vercelRequests).toEqual([]);
});

test("Finnish choices fit narrow light and dark pages and enlarged text", async ({
  page,
}, info) => {
  await installTrackingStubs(page);
  await page.setViewportSize({ width: 320, height: 800 });
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/fi/premium");
    const notice = page.getByRole("region", { name: "Yksityisyysvalintasi" });
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: "Evästeasetukset" }).click();
    await page.screenshot({
      path: info.outputPath(`privacy-fi-${theme}-320-normal.png`),
    });
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await notice.getByRole("button", { name: "Evästeasetukset" }).click();
    const dialog = page.getByRole("dialog", { name: "Evästeasetukset" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Evästeasetukset" }),
    ).toBeInViewport();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`privacy-fi-${theme}-320.png`),
    });
    const save = dialog.getByRole("button", {
      name: "Tallenna evästevalinnat",
    });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      notice.getByRole("button", { name: "Evästeasetukset" }),
    ).toBeFocused();
  }
});
