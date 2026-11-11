import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { hashToken } from "../src/utils/crypto";
import { testEnvironment, testOrigin } from "./environment";
import { openMainNavigation } from "./navigation";
import { emptyPaddleState } from "./paddle-fixture";
import { writePaddleState } from "./paddle-state";
import { accounts, newAccount, resetFixtures, testPrisma } from "./seed";

const signIn = async (page: Page, account = accounts.owner, locale = "fi") => {
  await page.goto(`/${locale}/sign-in`);
  await page
    .getByLabel(locale === "fi" ? "Sähköposti" : "Email", { exact: true })
    .fill(account.email);
  await page
    .getByLabel(locale === "fi" ? "Salasana" : "Password", { exact: true })
    .fill(account.password);
  await page
    .getByRole("button", {
      name: locale === "fi" ? "Kirjaudu" : "Sign in",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/lists$`));
};
const latestMail = async () => {
  const response = await fetch(
    `${testEnvironment.MAILPIT_URL}/api/v1/message/latest`,
  );
  expect(response.ok).toBe(true);
  return response.json() as Promise<{
    Text: string;
    HTML: string;
    Subject: string;
  }>;
};

test.beforeEach(async () => {
  await resetFixtures();
  await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
  });
});

test("language preferences reject foreign origins and invalid or oversized bodies", async ({
  request,
}) => {
  for (const origin of ["https://example.com", "null"]) {
    const response = await request.post("/api/locale", {
      headers: { origin },
      data: "fi",
    });
    expect(response.status()).toBe(403);
  }
  for (const data of ["sv", "", "fi".repeat(1000)]) {
    const response = await request.post("/api/locale", {
      headers: { origin: testOrigin },
      data,
    });
    expect(response.status()).toBe(400);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  const response = await request.post("/api/locale", {
    headers: { origin: testOrigin },
    data: "fi",
  });
  expect(response.status()).toBe(204);
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  expect(response.headers()["set-cookie"]).toMatch(/SameSite=lax/i);
  expect(response.headers()["set-cookie"]).toContain("Secure");
});

test("switching preserves queries, pagination and fragments; browser language and explicit preferences work", async ({
  page,
  browser,
}) => {
  await page.goto("/en/browse?view=wishes&page=2&currency=EUR#main-content");
  await page.getByLabel("Language", { exact: true }).selectOption("fi");
  await expect(page).toHaveURL(
    /\/fi\/browse\?view=wishes&page=2&currency=EUR#main-content$/,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fi");
  await expect(
    page.getByRole("heading", { name: "Selaa toivelistoja" }),
  ).toBeVisible();
  await page.goto("/about");
  await expect(page).toHaveURL(/\/fi\/about$/);
  await expect(page).toHaveTitle(/Tietoa Wishlistista/);
  await page.goto("/en/about");
  await expect(
    page.getByRole("heading", { name: "About Wishlist" }),
  ).toBeVisible();
  const finnish = await browser.newContext({
    baseURL: testOrigin,
    locale: "fi-FI",
  });
  const unsupported = await browser.newContext({
    baseURL: testOrigin,
    locale: "de-DE",
  });
  try {
    const fiPage = await finnish.newPage();
    await fiPage.goto("/");
    await expect(fiPage).toHaveURL(/\/fi$/);
    const enPage = await unsupported.newPage();
    await enPage.goto("/");
    await expect(enPage).toHaveURL(/\/en$/);
  } finally {
    await finnish.close();
    await unsupported.close();
  }
});

test("Finnish registration, validation, verification email and list/wish creation work", async ({
  page,
}) => {
  await page.goto("/fi/sign-up");
  await page
    .getByLabel("Käyttäjänimi", { exact: true })
    .fill(newAccount.username);
  await page.getByLabel("Sähköposti", { exact: true }).fill(newAccount.email);
  await page.getByLabel("Salasana", { exact: true }).fill(newAccount.password);
  await page
    .getByLabel("Vahvista salasana", { exact: true })
    .fill("Wrong-password!");
  await page.getByRole("button", { name: "Luo tili", exact: true }).click();
  await expect(
    page.getByText("Salasanat eivät täsmää", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Kieli", { exact: true }).selectOption("en");
  await expect(page).toHaveURL(/\/fi\/sign-up$/);
  await expect(page.getByLabel("Käyttäjänimi", { exact: true })).toHaveValue(
    newAccount.username,
  );
  await page.getByLabel("Salasana", { exact: true }).fill(newAccount.password);
  await page
    .getByLabel("Vahvista salasana", { exact: true })
    .fill(newAccount.password);
  await page.getByRole("button", { name: "Luo tili", exact: true }).click();
  await expect(page).toHaveURL(/\/fi\/email-verification$/);
  const mail = await latestMail();
  expect(mail.Subject).toBe("Vahvista Wishlist-sähköpostisi");
  expect(mail.HTML).toContain('lang="fi"');
  expect(mail.Text).toContain("30 minuutissa");
  const code = mail.Text.match(/^\s*([A-Z]{8})\s*$/m)?.[1];
  expect(code).toBeTruthy();
  await page.getByLabel("Vahvistuskoodi", { exact: true }).fill(code!);
  await page
    .getByRole("button", { name: "Vahvista sähköposti", exact: true })
    .click();
  await expect(page).toHaveURL(/\/fi\/lists$/);
  await page.getByRole("link", { name: "Luo lista", exact: true }).click();
  await page.getByLabel("Nimi", { exact: true }).fill("Birthday ideas");
  await page.getByRole("button", { name: "Luo lista", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Lista luotu");
  await page.getByRole("link", { name: "Lisää toive", exact: true }).click();
  await page.getByLabel("Nimi", { exact: true }).fill("Morning mug");
  await expect(
    page.getByText("Liitä linkki, jonka alussa on https:// tai http://.", {
      exact: true,
    }),
  ).toBeVisible();
  const imageInput = page.getByLabel("Kuva (valinnainen)", { exact: true });
  await expect(imageInput).toBeEnabled();
  await imageInput.setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await expect(imageInput).toHaveJSProperty(
    "validationMessage",
    "Valitse JPEG-, PNG- tai WebP-kuva.",
  );
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Valitse JPEG-, PNG- tai WebP-kuva.",
  );
  await page
    .getByRole("button", { name: "Poista valittu kuva", exact: true })
    .click();
  await expect(imageInput).toHaveJSProperty("validationMessage", "");

  await page.getByLabel("Hinta (valinnainen)", { exact: true }).fill("12,50");
  await page.getByLabel("Valuutta", { exact: true }).selectOption("EUR");
  await expect(
    page.getByLabel("Kuva (valinnainen)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lisää toive", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Morning mug", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/12,50\s+EUR/);
});

test("language switching asks before discarding a form and persists to the account", async ({
  page,
}) => {
  await signIn(page, accounts.owner, "en");
  await page.goto("/en/account/profile");
  await page.getByLabel("Display name", { exact: true }).fill("Unsaved name");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByLabel("Language", { exact: true }).selectOption("fi");
  await expect(page).toHaveURL(/\/en\/account\/profile$/);
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "Unsaved name",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Language", { exact: true }).selectOption("fi");
  await expect(page).toHaveURL(/\/fi\/account\/profile$/);
  const prisma = testPrisma();
  try {
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: "e2e-owner" } }))
        .locale,
    ).toBe("fi");
  } finally {
    await prisma.$disconnect();
  }
  await page.context().clearCookies({ name: "wishlist-locale" });
  await page.goto("/account/profile");
  await expect(page).toHaveURL(/\/fi\/account\/profile$/);
  await page.getByLabel("Näyttönimi", { exact: true }).fill("Saved name");
  await page
    .getByRole("button", { name: "Tallenna profiili", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Profiili tallennettu");
  let confirmations = 0;
  page.once("dialog", async (dialog) => {
    confirmations++;
    await dialog.accept();
  });
  await page.getByLabel("Kieli", { exact: true }).selectOption("en");
  await expect(page).toHaveURL(/\/en\/account\/profile$/);
  expect(confirmations).toBe(0);

  await page.goto("/en/lists/new");
  await page.getByLabel("Title", { exact: true }).fill("Summer ideas");
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await page.getByRole("link", { name: "List settings", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Saved summer ideas");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved.");
  await page.getByLabel("Language", { exact: true }).selectOption("fi");
  await expect(page).toHaveURL(/\/fi\/lists\/[^/]+\/edit$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Listan asetukset",
  );
  await expect(page.getByLabel("Nimi", { exact: true })).toHaveValue(
    "Saved summer ideas",
  );
  expect(confirmations).toBe(0);
});

test("Finnish reservation and recovery journeys keep user content and saved language", async ({
  page,
}) => {
  const prisma = testPrisma();
  try {
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { locale: "fi" },
    });
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: {
        visibility: "PUBLIC",
        publication: "PUBLISHED",
        reservationsEnabled: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  await signIn(page);
  await page.goto("/fi/lists/e2e-private-list/wishes/e2e-wish");
  await page.getByRole("button", { name: "Varaa toive", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Olet varannut toiveen");
  await (
    await openMainNavigation(page, "fi")
  )
    .getByRole("link", { name: "Omat varaukset", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Omat varaukset", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Private wish");
  await page.getByRole("button", { name: "Peru varaus", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Varaus peruttu");
  await page.goto("/fi/password-forgot");
  await page
    .getByLabel("Sähköposti", { exact: true })
    .fill(accounts.owner.email);
  await page
    .getByRole("button", { name: "Lähetä palautuslinkki", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Jos sähköpostilla on tili",
  );
  const mail = await latestMail();
  expect(mail.Subject).toBe("Palauta Wishlist-salasanasi");
  const link = mail.Text.match(
    /http:\/\/127\.0\.0\.1:3017\/fi\/password-reset\/[a-z2-7]{32}/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);
  await page
    .getByLabel("Salasana", { exact: true })
    .fill("Recovered-password!");
  await page
    .getByLabel("Vahvista salasana", { exact: true })
    .fill("Recovered-password!");
  await page
    .getByRole("button", { name: "Palauta salasana", exact: true })
    .click();
  await expect(page).toHaveURL(/\/fi\/sign-in\?reset=success$/);
  await expect(page.getByRole("main")).toContainText(
    "Salasanasi on palautettu",
  );
});

test("legacy guest links preserve secrets across locale redirects and both guest views stay read-only", async ({
  page,
  request,
}) => {
  const prisma = testPrisma();
  const token = "a".repeat(32);
  try {
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { publication: "PUBLISHED" },
    });
    await prisma.guestLink.create({
      data: {
        label: "Fi guest",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 3600000),
        wishlistId: "e2e-private-list",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  await page.goto(`/guest#${token}`);
  await expect(page).toHaveURL(/\/en\/guest\/lists\/e2e-private-list$/);
  expect(page.url()).not.toContain(token);
  await page.getByLabel("Language", { exact: true }).selectOption("fi");
  await expect(page).toHaveURL(/\/fi\/guest\/lists\/e2e-private-list$/);
  await expect(page.getByRole("main")).toContainText("Vierasnäkymä");
  await expect(page.getByRole("main")).toContainText("Private wish");
  for (const path of [
    "/guest/lists/e2e-private-list",
    "/en/guest/lists/e2e-private-list",
    "/fi/guest/lists/e2e-private-list",
  ]) {
    const response = await request.post(path, {
      headers: { "next-action": "forged" },
    });
    expect(response.status()).toBe(405);
  }
});

test("Finnish invitations use the recipient's saved language and keep the acceptance journey localized", async ({
  page,
  browser,
}) => {
  const prisma = testPrisma();
  try {
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { locale: "fi" },
    });
    await prisma.premiumGrant.create({
      data: {
        userId: "e2e-member",
        startsAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { publication: "PUBLISHED" },
    });
  } finally {
    await prisma.$disconnect();
  }
  await signIn(page, accounts.member, "en");
  await page.goto("/en/lists/e2e-private-list/sharing");
  await page
    .getByLabel("Invitation email", { exact: true })
    .fill(accounts.owner.email);
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Invitation created");
  const mail = await latestMail();
  expect(mail.Subject).toBe("Kutsusi Wishlistiin");
  const link = mail.Text.match(
    /http:\/\/127\.0\.0\.1:3017\/fi\/invitations\/[a-z0-9]+/,
  )?.[0];
  expect(link).toBeTruthy();
  const recipient = await browser.newPage();
  try {
    await signIn(recipient);
    await recipient.goto(link!);
    await expect(
      recipient.getByRole("heading", { name: "Listakutsu", exact: true }),
    ).toBeVisible();
    await recipient.getByRole("checkbox").check();
    await recipient
      .getByRole("button", { name: "Hyväksy kutsu", exact: true })
      .click();
    await expect(recipient).toHaveURL(/\/fi\/lists\?shared=1/);
    await expect(recipient.getByRole("status")).toContainText(
      "Kutsu hyväksytty",
    );
  } finally {
    await recipient.close();
  }
});

test("Finnish billing explains the provider language and returns checkout to Finnish", async ({
  page,
}) => {
  await writePaddleState(emptyPaddleState());
  await page.route("https://cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.Paddle={Update:()=>{},Environment:{set:()=>{}},Initialize:()=>{},Checkout:{open:({settings})=>{document.body.dataset.checkoutLocale=settings.locale;document.body.dataset.checkoutReturn=settings.successUrl}}};",
    }),
  );
  await signIn(page);
  await page.goto("/fi/account/plan");
  await page.getByLabel("Etukoodi", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Käytä koodi", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Etukoodi ei ole käytettävissä. Tarkista koodi tai ota yhteyttä sen antajaan.",
  );
  await page
    .getByRole("checkbox", { name: /kuukausittaisen uusiutumisen/ })
    .check();
  await page
    .getByRole("button", { name: "Valitse kuukausitilaus", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Premium-maksu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Paddlen maksuikkuna avautuu englanniksi.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Avaa suojattu maksuikkuna", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-checkout-locale",
    "en",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-checkout-return",
    `${testOrigin}/fi/account/plan?checkout=returned`,
  );
  await page.goto("/fi/account/plan?checkout=returned");
  await expect(
    page.getByRole("heading", { name: "Ilmainen", exact: true }),
  ).toBeVisible();
});

test("Finnish public, account and information screens fit 320px and remain accessible in both themes", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 727 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  const prisma = testPrisma();
  try {
    await prisma.wishlist.create({
      data: {
        id: "e2e-language-settings",
        title: "Summer ideas",
        ownerId: "e2e-owner",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      localStorage.setItem("theme", value);
    }, theme);
    for (const path of [
      "/fi/browse?view=users",
      "/fi/lists",
      "/fi/lists/new",
      "/fi/lists/e2e-language-settings/edit",
      "/fi/lists/e2e-language-settings/wishes/new",
      "/fi/reservations",
      "/fi/account/profile",
      "/fi/account/plan",
      "/fi/about",
      "/fi/privacy",
      "/fi/terms",
      "/fi/accessibility",
      "/fi/site-map",
    ]) {
      await page.goto(path);
      await expect(page.locator("[data-loading-preview]")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        path,
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations,
        path,
      ).toEqual([]);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>("body *")]
            .filter(
              (element) =>
                element.getBoundingClientRect().right > window.innerWidth + 1 &&
                getComputedStyle(element).position !== "absolute",
            )
            .map((element) => ({
              tag: element.tagName,
              text: element.textContent?.slice(0, 60),
              width: Math.round(element.getBoundingClientRect().width),
            })),
        ),
        `${path}, 200% text`,
      ).toEqual([]);
      const reflow = await page.evaluate(() => ({
        width: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        reflow.scrollWidth,
        `${path}, 200% document reflow`,
      ).toBeLessThanOrEqual(reflow.width + 1);
      await page.evaluate(() => {
        document.documentElement.style.removeProperty("font-size");
      });
    }
  }
  await page.screenshot({
    path: info.outputPath("finnish-narrow.png"),
    fullPage: true,
  });
});
