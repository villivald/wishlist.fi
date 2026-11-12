import { expect, type Page, test } from "@playwright/test";
import { testEnvironment, testOrigin } from "./environment";
import { accounts, resetFixtures, testPrisma } from "./seed";

const googleEmail = "e2e-google-new@gmail.com";
const mockGoogle = async (
  page: Page,
  {
    email = googleEmail,
    subject = "e2e-google-new",
    cancel = false,
    badAudience = false,
    nonceMismatch = false,
  }: {
    email?: string;
    subject?: string;
    cancel?: boolean;
    badAudience?: boolean;
    nonceMismatch?: boolean;
  } = {},
) => {
  await page.route("**/api/auth/google/start?**", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const url = new URL(response.headers().location);
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const destination = new URL(url.searchParams.get("redirect_uri")!);
    destination.searchParams.set("state", url.searchParams.get("state")!);
    if (cancel) destination.searchParams.set("error", "access_denied");
    else
      destination.searchParams.set(
        "code",
        Buffer.from(
          JSON.stringify({
            email,
            subject,
            nonce: nonceMismatch
              ? "wrong-nonce"
              : url.searchParams.get("nonce"),
            challenge: url.searchParams.get("code_challenge"),
            badAudience,
          }),
        ).toString("base64url"),
      );
    await route.fulfill({
      response,
      status: 303,
      headers: { ...response.headers(), location: destination.href },
    });
  });
};

test.beforeEach(resetFixtures);

test("Google endpoints reject cross-site starts, GET initiation and unbound callbacks", async ({
  request,
}) => {
  const endpoint = "/api/auth/google/start?locale=fi";
  for (const origin of [undefined, "https://attacker.example", "null"]) {
    const response = await request.post(endpoint, {
      headers: origin ? { origin } : {},
      maxRedirects: 0,
    });
    expect(response.status()).toBe(403);
  }
  expect((await request.get(endpoint, { maxRedirects: 0 })).status()).toBe(405);
  const invalid = await request.get(
    "/api/auth/google/callback?state=unbound&code=untrusted",
    { maxRedirects: 0 },
  );
  expect(invalid.status()).toBe(303);
  expect(invalid.headers().location).toMatch(/\/en\/sign-in\?google=failed$/);
  expect(invalid.headers()["cache-control"]).toBe("no-store");
  expect(invalid.headers()["referrer-policy"]).toBe("no-referrer");
  expect(invalid.headers()["set-cookie"]).toBeUndefined();
});

test("Google signup and returning sign-in preserve locale and create one private identity and welcome message", async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto("/fi/sign-up?returnTo=%2Ffi%2Fbrowse");
  await page.getByRole("button", { name: "Jatka Googlella" }).click();
  await expect(page).toHaveURL(/\/fi\/browse$/);
  const prisma = testPrisma();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: googleEmail },
      include: { identities: true },
    });
    expect(user).toMatchObject({
      emailVerified: true,
      passwordHash: null,
      locale: "fi",
      name: null,
    });
    expect(user.username).toMatch(/^toive-[1-9][0-9]{5}$/);
    expect(user.identities).toHaveLength(1);
    expect(
      await prisma.accountEmail.count({ where: { key: `welcome/${user.id}` } }),
    ).toBe(1);
    await page.context().clearCookies();
    await page.goto("/en/sign-in");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/\/en\/lists$/);
    expect(await prisma.user.count({ where: { email: googleEmail } })).toBe(1);
    expect(
      await prisma.accountEmail.count({ where: { key: `welcome/${user.id}` } }),
    ).toBe(1);
  } finally {
    await prisma.$disconnect();
  }
});

test("a matching email cannot take over an existing account; explicit authenticated linking works", async ({
  page,
}) => {
  await mockGoogle(page, {
    email: accounts.owner.email,
    subject: "e2e-google-owner",
  });
  await page.goto("/en/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/google=link-required/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "sign in with email first",
  );
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await page.goto("/en/account/profile");
  await page.getByRole("button", { name: "Connect Google" }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(
    page.getByText("Google is connected to your account."),
  ).toBeVisible();
  await page.context().clearCookies();
  await page.goto("/en/sign-in");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/lists$/);
  const prisma = testPrisma();
  try {
    expect(
      (
        await prisma.authIdentity.findUniqueOrThrow({
          where: {
            provider_subject: {
              provider: "google",
              subject: "e2e-google-owner",
            },
          },
        })
      ).userId,
    ).toBe("e2e-owner");
  } finally {
    await prisma.$disconnect();
  }
});

test("passwordless users can set a password through email and keep Google sign-in", async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto("/en/sign-up");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
  });
  await page.goto("/en/account/password");
  await expect(
    page.getByRole("heading", { name: "Set a password" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send password setup link" }).click();
  await expect(page.getByRole("status")).toContainText("latest link");
  const message = (await (
    await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/message/latest`)
  ).json()) as { Text: string };
  const reset = message.Text.match(
    /http:\/\/127\.0\.0\.1:3017\/en\/password-reset\/[^\s]+/,
  )![0];
  await page.goto(reset);
  await page
    .getByLabel("Password", { exact: true })
    .fill("New-google-password!");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("New-google-password!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sign-in\?reset=success$/);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/lists$/);
});

test("Google-only deletion requires a fresh confirmation from the same linked Google identity", async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto("/en/sign-up");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await page.goto("/en/account/delete");
  await expect(
    page.getByRole("button", { name: "Permanently delete account" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm with Google" }).click();
  await expect(page).toHaveURL(/\/account\/delete$/);
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();
  await expect(page).toHaveURL(/\/sign-in\?deleted=1$/);
  const prisma = testPrisma();
  try {
    expect(
      await prisma.authIdentity.count({ where: { subject: "e2e-google-new" } }),
    ).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
});

for (const failure of ["cancel", "badAudience", "nonceMismatch"] as const)
  test(`Google ${failure} leaves the email alternative usable`, async ({
    page,
  }) => {
    await mockGoogle(page, { [failure]: true });
    await page.goto("/en/sign-in?returnTo=%2Fen%2Ffavorites");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect(page).toHaveURL(
      failure === "cancel" ? /google=canceled/ : /google=failed/,
    );
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    const prisma = testPrisma();
    try {
      expect(await prisma.user.count({ where: { email: googleEmail } })).toBe(
        0,
      );
    } finally {
      await prisma.$disconnect();
    }
  });

test("Google button works without JavaScript and fits Finnish dark/light at 320px and enlarged text", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: testOrigin,
    viewport: { width: 320, height: 740 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await mockGoogle(page);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/fi/sign-up");
      await page.evaluate((theme) => {
        document.documentElement.style.fontSize = "200%";
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, colorScheme);
      const button = page.getByRole("button", { name: "Jatka Googlella" });
      await button.focus();
      await expect(button).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`google-fi-320-${colorScheme}.png`),
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Jatka Googlella" }).press("Enter");
    await expect(page).toHaveURL(/\/fi\/lists$/);
  } finally {
    await context.close();
  }
});
