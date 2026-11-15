import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { expectImageLoaded } from "./image-assertions";
import { openMainNavigation } from "./navigation";
import { accounts, resetFixtures, testPrisma } from "./seed";

const copy = {
  en: {
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    lists: "My lists",
    firstList: "Create your first list",
    create: "Create a list",
    verify: "Verify email",
    how: "See how Wishlist works",
    title: "Title",
    save: "Create list",
    welcome: "No lists yet",
    more: "No more lists",
  },
  fi: {
    email: "Sähköposti",
    password: "Salasana",
    signIn: "Kirjaudu",
    lists: "Omat listat",
    firstList: "Luo ensimmäinen listasi",
    create: "Luo lista",
    verify: "Vahvista sähköposti",
    how: "Katso, miten Wishlist toimii",
    title: "Nimi",
    save: "Luo lista",
    welcome: "Ei vielä listoja",
    more: "Ei enempää listoja",
  },
} as const;

const signIn = async (
  page: Page,
  locale: keyof typeof copy,
  returnTo?: string,
) => {
  const t = copy[locale];
  await page.goto(
    `/${locale}/sign-in${returnTo ? `?${new URLSearchParams({ returnTo })}` : ""}`,
  );
  await page
    .getByRole("textbox", { name: t.email, exact: true })
    .fill(accounts.owner.email);
  await page
    .getByLabel(t.password, { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: t.signIn, exact: true }).click();
};

test.beforeEach(resetFixtures);

for (const locale of ["en", "fi"] as const) {
  test(`${locale}: signed-in homepage, first-list welcome and creation stay connected`, async ({
    page,
  }, info) => {
    const t = copy[locale];
    await signIn(page, locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/lists$`));
    const welcome = page.getByRole("region", { name: t.welcome, exact: true });
    await expect(welcome).toBeVisible();
    await expectImageLoaded(welcome.locator("img"));
    await welcome.getByRole("link", { name: t.how, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    const main = page.getByRole("main");
    await expect(
      main.getByRole("link", { name: t.lists, exact: true }),
    ).toHaveAttribute("href", `/${locale}/lists`);
    for (const link of await main
      .getByRole("link", { name: t.create, exact: true })
      .all()) {
      await expect(link).toHaveAttribute("href", `/${locale}/lists/new`);
    }
    await expect(
      main.getByRole("link", { name: t.create, exact: true }),
    ).toHaveCount(2);
    await expect(main.locator('a[href$="/sign-up"]')).toHaveCount(0);
    for (const landmark of ["banner", "contentinfo"] as const) {
      await expect(
        page
          .getByRole(landmark)
          .getByRole("link", { name: "Wishlist", exact: true }),
      ).toHaveAttribute("href", `/${locale}`);
    }
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`signed-in-home-${locale}.png`),
      fullPage: true,
    });
    await main.getByRole("link", { name: t.lists, exact: true }).click();

    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      for (const dark of [false, true]) {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.evaluate(
          ({ dark, width }) => {
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.style.fontSize =
              width === 320 ? "200%" : "";
          },
          { dark, width },
        );
        await expect(welcome).toBeVisible();
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
            `welcome-${locale}-${width}-${dark ? "dark" : "light"}.png`,
          ),
          fullPage: true,
        });
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await welcome.getByRole("link", { name: t.firstList, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/lists/new$`));
    await page
      .getByRole("textbox", { name: t.title, exact: true })
      .fill("My first wishlist");
    await page.getByRole("button", { name: t.save, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/lists/[a-z0-9]+(?:[?]created=1)?$`),
    );
    await expect(
      page.getByRole("heading", { name: "My first wishlist", exact: true }),
    ).toBeVisible();
    await (
      await openMainNavigation(page, locale)
    )
      .getByRole("link", { name: t.lists, exact: true })
      .click();
    await expect(welcome).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "My first wishlist", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Wishlist", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    await page.goto(`/${locale}/browse`);
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Wishlist", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
  });

  test(`${locale}: unverified users can see home and return to verification`, async ({
    page,
  }) => {
    const db = testPrisma();
    try {
      await db.user.update({
        where: { id: "e2e-owner" },
        data: { emailVerified: false },
      });
    } finally {
      await db.$disconnect();
    }
    const t = copy[locale];
    await signIn(page, locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/email-verification$`));
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Wishlist", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}$`));
    const actions = page
      .getByRole("main")
      .getByRole("link", { name: t.verify, exact: true });
    await expect(actions).toHaveCount(2);
    for (const link of await actions.all())
      await expect(link).toHaveAttribute(
        "href",
        `/${locale}/email-verification`,
      );
    await expect(
      page
        .getByRole("main")
        .locator('a[href$="/lists/new"], a[href$="/sign-up"]'),
    ).toHaveCount(0);
    await actions.first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/email-verification$`));
    await page.goto(`/${locale}/lists/new`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/email-verification`));
  });

  test(`${locale}: intended login destinations and empty pagination remain intact`, async ({
    page,
  }) => {
    const t = copy[locale];
    await signIn(page, locale, `/${locale}/browse`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/browse$`));
    await page.goto(`/${locale}/lists?page=2`);
    await expect(
      page.getByRole("region", { name: t.welcome, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: t.more, exact: true }),
    ).toBeVisible();
  });

  test(`${locale}: streamed list fallback and homepage links work without JavaScript`, async ({
    page,
    browser,
  }) => {
    const t = copy[locale];
    await signIn(page, locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/lists$`));
    const context = await browser.newContext({
      baseURL: new URL(page.url()).origin,
      javaScriptEnabled: false,
    });
    try {
      await context.addCookies(await page.context().cookies());
      const native = await context.newPage();
      await native.goto(`/${locale}/lists`, { waitUntil: "domcontentloaded" });
      await expect(native.locator("[data-loading-preview]")).toBeVisible();
      await native
        .getByRole("banner")
        .getByRole("link", { name: "Wishlist", exact: true })
        .click();
      await expect(native).toHaveURL(new RegExp(`/${locale}$`));
      await native
        .getByRole("main")
        .getByRole("link", { name: t.create, exact: true })
        .first()
        .click();
      await expect(native).toHaveURL(new RegExp(`/${locale}/lists/new$`));
    } finally {
      await context.close();
    }
  });
}
