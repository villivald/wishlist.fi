import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import type { TextKey } from "../src/i18n/text";
import { completePayment, emptyPaddleState } from "./paddle-fixture";
import {
  readPaddleState as providerState,
  writePaddleState as save,
} from "./paddle-state";
import { accounts, resetFixtures, testPrisma } from "./seed";

test.beforeEach(async ({ page }) => {
  await resetFixtures();
  await save(emptyPaddleState());
  await page.route("https://cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.Paddle={Update:()=>{},Environment:{set:()=>{}},Initialize:(options)=>{window.paddleTestEvent=options.eventCallback},Checkout:{open:()=>{document.body.dataset.checkoutOpened='true'}}};`,
    }),
  );
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(accounts.owner.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(accounts.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
  await page.goto("/en/account/plan");
});

const choose = async (
  page: import("@playwright/test").Page,
  interval = "monthly",
) => {
  await page
    .getByRole("checkbox", {
      name: new RegExp(`automatic ${interval} renewal`),
    })
    .check();
  await page
    .getByRole("button", { name: `Choose ${interval}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Premium checkout", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open secure checkout", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-checkout-opened",
    "true",
  );
};
const billingSettled = async (
  page: import("@playwright/test").Page,
  locale = "en",
) =>
  expect(
    page.getByRole("status", {
      name: locale === "fi" ? "Maksutietojen tila" : "Billing status",
    }),
  ).toContainText(
    locale === "fi"
      ? "Maksutiedot ovat ajan tasalla."
      : "Billing details are up to date",
  );

const refresh = async (page: import("@playwright/test").Page) => {
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await billingSettled(page);
};

test("checkout return checks Paddle automatically without trusting the return URL", async ({
  page,
  browser,
}, info) => {
  await choose(page);
  const checkoutUrl = page.url();
  const other = await browser.newPage();
  try {
    await other.goto(checkoutUrl);
    await expect(other).toHaveURL(/sign-in/);
  } finally {
    await other.close();
  }
  await page.goto("/en/account/plan?checkout=returned");
  await expect(
    page.getByRole("heading", { name: "Free", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Checking your payment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discard checkout", exact: true }),
  ).toHaveCount(0);
  const state = await providerState();
  completePayment(state, state.transactions[0].id);
  await save(state);
  await expect(
    page.getByRole("heading", { name: "Premium", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Auto-renewal on", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Discard checkout", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Payment confirmed. Your Premium access is ready."),
  ).toBeVisible();
  expect((await providerState()).createCount).toBe(1);
  await billingSettled(page);
  await page.goto(checkoutUrl);
  await expect(page).toHaveURL(/account\/plan\?checkout=returned/);
  await expect(
    page.getByRole("button", { name: "Choose monthly", exact: true }),
  ).toHaveCount(0);
  await billingSettled(page);
  await page.screenshot({
    path: info.outputPath("billing-active.png"),
    fullPage: true,
    scale: "css",
  });
  const scheduled = await providerState();
  scheduled.subscriptions[0].scheduled_change = {
    action: "cancel",
    effective_at: scheduled.transactions[0].billing_period!.ends_at,
  };
  scheduled.subscriptions[0].next_billed_at = null;
  scheduled.subscriptions[0].updated_at = new Date().toISOString();
  await save(scheduled);
  await page.reload();
  await expect(
    page.getByText("Renewal canceled", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Subscription ends on/)).toBeVisible();
  await expect(
    page.getByText(
      "This subscription will not renew. Your remaining paid access stays available.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/Next payment:/)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Premium", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose monthly", exact: true }),
  ).toHaveCount(0);
  await billingSettled(page);
  await page.getByRole("combobox", { name: "Language" }).selectOption("fi");
  await expect(page).toHaveURL(/\/fi\/account\/plan/);
  const main = page.getByRole("main");
  await expect(
    main.getByText("Automaattinen uusiminen peruttu", { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText(
      "Tilaus ei uusiudu automaattisesti. Jäljellä oleva maksettu käyttöaikasi säilyy.",
      { exact: true },
    ),
  ).toBeVisible();
  await billingSettled(page, "fi");
  await page.getByRole("combobox", { name: "Kieli" }).selectOption("en");
  await expect(page).toHaveURL(/\/en\/account\/plan/);
  await billingSettled(page);
  await page.route("https://sandbox-customer-portal.paddle.com/**", (route) =>
    route.fulfill({
      body: "<h1>Paddle customer portal fixture</h1>",
      contentType: "text/html",
    }),
  );
  await page
    .getByRole("button", { name: "Manage subscription", exact: true })
    .click();
  await expect(page).toHaveURL(/sandbox-customer-portal.paddle.com/);
  expect(new URL(page.url()).searchParams.get("action")).toBe(
    "view_subscription",
  );
});

test("a canceled subscription allows a different plan only after paid access expires", async ({
  page,
}) => {
  await choose(page);
  const state = await providerState();
  completePayment(state, state.transactions[0].id);
  const expiresAt = Date.now() + 12_000;
  state.transactions[0].billing_period!.ends_at = new Date(
    expiresAt,
  ).toISOString();
  state.subscriptions[0].next_billed_at = new Date(expiresAt).toISOString();
  await save(state);
  await page.goto("/en/account/plan");
  await refresh(page);
  await expect(
    page.getByRole("heading", { name: "Premium", exact: true }),
  ).toBeVisible();

  state.subscriptions[0].status = "canceled";
  state.subscriptions[0].next_billed_at = null;
  state.subscriptions[0].updated_at = new Date().toISOString();
  await save(state);
  await refresh(page);
  const canceledCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Monthly subscription" }),
  });
  await expect(
    canceledCard.getByText("€3 / month", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Choose annual", exact: true }),
  ).toHaveCount(0);

  await expect
    .poll(() => Date.now(), { timeout: 20_000 })
    .toBeGreaterThan(expiresAt);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Free", exact: true }),
  ).toBeVisible();
  await choose(page, "annual");
  const switched = await providerState();
  expect(switched.createCount).toBe(2);
  expect(switched.subscriptions).toHaveLength(1);
  expect(switched.subscriptions[0].status).toBe("canceled");
  expect(switched.transactions[1].details?.totals.total).toBe("1500");
});

test("checkout return falls back to manual controls when Paddle is unavailable, in Finnish", async ({
  page,
}) => {
  await choose(page);
  const state = await providerState();
  state.fail = true;
  await save(state);
  await page.goto("/fi/account/plan?checkout=returned");
  await expect(
    page.getByRole("heading", {
      name: "Maksua ei ole vielä vahvistettu",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Maksutietojen tila" }),
  ).toContainText("Paddle ei ole juuri nyt käytettävissä");
  await expect(
    page.getByRole("link", { name: "Jatka maksamista", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Päivitä maksutiedot", exact: true }),
  ).toBeVisible();
  expect((await providerState()).createCount).toBe(1);
});

test("returning focus to the plan page picks up cancellation without another payment", async ({
  page,
}) => {
  await choose(page);
  const state = await providerState();
  completePayment(state, state.transactions[0].id);
  await save(state);
  const synced = page.waitForResponse(
    (response) =>
      response.url().includes("/account/plan") &&
      response.request().method() === "POST",
  );
  await page.goto("/en/account/plan?checkout=returned");
  await synced;
  await expect(
    page.getByText("Auto-renewal on", { exact: true }),
  ).toBeVisible();

  const canceled = await providerState();
  canceled.subscriptions[0].scheduled_change = {
    action: "cancel",
    effective_at: canceled.transactions[0].billing_period!.ends_at,
  };
  canceled.subscriptions[0].next_billed_at = null;
  canceled.subscriptions[0].updated_at = new Date().toISOString();
  await save(canceled);
  await page.clock.install();
  await page.clock.fastForward(6000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("Renewal canceled", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Next payment:/)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Premium", exact: true }),
  ).toBeVisible();
  expect((await providerState()).createCount).toBe(1);
});

test("abandoned checkouts can be resumed or discarded before selecting the annual plan", async ({
  page,
}) => {
  await choose(page);
  await page.goto("/en/account/plan");
  await page
    .getByRole("button", { name: "Discard checkout", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose annual", exact: true }),
  ).toBeVisible();
  await choose(page, "annual");
  const state = await providerState();
  expect(state.createCount).toBe(2);
  expect(state.transactions[0].status).toBe("canceled");
  expect(state.transactions[1].details?.totals.total).toBe("1500");
});

test("refunds remove paid access and provider outages have recoverable feedback", async ({
  page,
}) => {
  await choose(page);
  const state = await providerState();
  completePayment(state, state.transactions[0].id);
  await save(state);
  await page.goto("/en/account/plan");
  await refresh(page);
  state.fail = true;
  await save(state);
  await page
    .getByRole("button", { name: "Refresh billing", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Billing status" }),
  ).toContainText("unavailable");
  state.fail = false;
  state.transactions[0].adjustments = [
    { action: "refund", status: "approved", totals: { total: "300" } },
  ];
  await save(state);
  await refresh(page);
  await expect(
    page.getByRole("heading", { name: "Free", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A refund does not cancel automatic renewal. You can manage renewal in Paddle.",
      { exact: false },
    ),
  ).toBeVisible();
});

for (const locale of ["en", "fi"] as const) {
  test(`refunded canceled renewal explains access and offers buyer support in ${locale}`, async ({
    page,
  }, info) => {
    const messages = createRequire(import.meta.url)(
      `../src/i18n/messages/${locale}.json`,
    ) as Record<TextKey, string>;
    const t = (key: TextKey) => messages[key];
    await choose(page);
    const state = await providerState();
    const transaction = state.transactions[0];
    completePayment(state, transaction.id);
    const subscription = state.subscriptions[0];
    subscription.scheduled_change = {
      action: "cancel",
      effective_at: transaction.billing_period!.ends_at,
    };
    subscription.next_billed_at = null;
    subscription.updated_at = new Date().toISOString();
    transaction.adjustments = [
      {
        action: "refund",
        status: "pending_approval",
        totals: { total: "300" },
      },
    ];
    await save(state);
    await page.goto("/en/account/plan");
    await refresh(page);
    await expect(
      page.getByRole("heading", { name: "Premium", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "This subscription will not renew. Your remaining paid access stays available.",
        { exact: true },
      ),
    ).toBeVisible();

    transaction.adjustments[0].status = "approved";
    await save(state);
    await refresh(page);
    await page.goto(`/${locale}/account/plan`);
    await expect(
      page.getByRole("heading", { name: t("Free"), exact: true }),
    ).toBeVisible();
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: t("Monthly subscription"),
        exact: true,
      }),
    });
    await expect(
      card.getByText(
        t(
          "This subscription will not renew. No paid access remains from this subscription.",
        ),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      card.getByText(t("Cancellation takes effect on"), { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText(
        t(
          "This subscription will not renew. Your remaining paid access stays available.",
        ),
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(
      card.getByText(
        t(
          "A refund does not cancel automatic renewal. You can manage renewal in Paddle.",
        ),
        { exact: false },
      ),
    ).toHaveCount(0);
    const refundMessage = card.locator("p").filter({
      hasText: t(
        "A payment was fully refunded. Access from that payment was removed.",
      ),
    });
    await expect(refundMessage).toBeVisible();
    await expect(refundMessage).not.toHaveAttribute("data-tone", "attention");
    const request = card.getByRole("link", {
      name: t("Request a refund"),
      exact: true,
    });
    await expect(request).toHaveAttribute("href", "https://paddle.net/");
    await expect(
      page
        .getByRole("region", { name: t("Billing help"), exact: true })
        .getByRole("link", { name: t("Request a refund"), exact: true }),
    ).toHaveAttribute("href", "https://paddle.net/");
    await expect(
      page
        .getByRole("main")
        .getByText(
          t(
            "Paddle reviews refund requests. To stop future charges, cancel renewal separately.",
          ),
          { exact: true },
        ),
    ).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [theme, width] of [
      ["light", 1280],
      ["dark", 320],
    ] as const) {
      await page.evaluate((value) => {
        localStorage.setItem("theme", value);
      }, theme);
      await page.reload();
      await page.setViewportSize({ width, height: 800 });
      await request.focus();
      await expect(request).toBeFocused();
      expect(
        await request.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
      ).not.toBe("none");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`billing-refunded-${locale}-${theme}.png`),
        fullPage: true,
        scale: "css",
      });
    }
    await page.addStyleTag({ content: "html { font-size: 200%; }" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`billing-refunded-${locale}-200-percent.png`),
      fullPage: true,
      scale: "css",
    });

    const restart = card.getByRole("button", {
      name: t("Start a new subscription"),
      exact: true,
    });
    await expect(restart).toBeDisabled();
    await card
      .getByRole("checkbox", {
        name: t(
          "I want to end this refunded subscription immediately and choose a new plan.",
        ),
        exact: true,
      })
      .check();
    await restart.click();
    await expect(page).toHaveURL(/account\/plan#subscription-heading$/);
    await billingSettled(page, locale);
    await expect(
      page.getByRole("button", {
        name: t("Choose {value0}").replace(
          "{value0}",
          t("Monthly").toLowerCase(),
        ),
        exact: true,
      }),
    ).toBeVisible();
    expect((await providerState()).createCount).toBe(1);
    expect((await providerState()).subscriptions[0].status).toBe("canceled");
    await expect(
      card.getByText(
        t(
          "Renewal has stopped. No paid access remains from this subscription.",
        ),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      card.getByText(
        t(
          "Renewal has stopped. Any remaining paid time stays available until it expires.",
        ),
        { exact: true },
      ),
    ).toHaveCount(0);
    await page.route("https://paddle.net/", (route) =>
      route.fulfill({
        body: "<h1>Paddle buyer support fixture</h1>",
        contentType: "text/html",
      }),
    );
    await request.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Paddle buyer support fixture" }),
    ).toBeVisible();
    await page.goto(`/${locale}/refunds`);
    await expect(
      page.getByRole("link", { name: t("Request a refund"), exact: true }),
    ).toHaveAttribute("href", "https://paddle.net/");
    await expect(
      page
        .locator("article")
        .getByRole("link", { name: "support@wishlist.fi", exact: true }),
    ).toHaveAttribute("href", "mailto:support@wishlist.fi");
    await page.goto("/en/account/plan");
    await choose(page, "annual");
    const restarted = await providerState();
    expect(restarted.createCount).toBe(2);
    expect(restarted.subscriptions[0].status).toBe("canceled");
    completePayment(restarted, restarted.transactions[1].id);
    await save(restarted);
    await page.goto("/en/account/plan?checkout=returned");
    await expect(
      page.getByRole("heading", { name: "Premium", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Annual subscription", exact: true }),
    ).toBeVisible();
  });
}

test("subscription controls fit a 320px dark layout and work with the keyboard", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page
    .getByRole("checkbox", { name: /automatic annual renewal/ })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("checkbox", { name: /automatic annual renewal/ }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("billing-narrow-dark.png"),
    fullPage: true,
    scale: "css",
  });
  await page
    .getByRole("button", { name: "Choose annual", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Premium checkout", exact: true }),
  ).toBeVisible();
  const prisma = testPrisma();
  try {
    await prisma.session.deleteMany({ where: { userId: "e2e-owner" } });
    await page.reload();
    await expect(page).toHaveURL(/sign-in/);
  } finally {
    await prisma.$disconnect();
  }
});

test("plan choices are accessible in English and Finnish at desktop and narrow dark widths", async ({
  page,
}, info) => {
  await expect(page.getByText("€3 / month", { exact: true })).toBeVisible();
  await expect(page.getByText("€15 / year", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Save €21 a year compared with monthly billing."),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("billing-pricing.png"),
    fullPage: true,
    scale: "css",
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/fi/account/plan");
  await expect(page.getByText("3 € / kuukausi", { exact: true })).toBeVisible();
  await expect(page.getByText("15 € / vuosi", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Säästät 21 € vuodessa kuukausitilaukseen verrattuna."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include("main").analyze()).violations,
  ).toEqual([]);
  await page.screenshot({
    path: info.outputPath("billing-finnish-dark.png"),
    fullPage: true,
    scale: "css",
  });
});

test("closing and reopening the payment window keeps the same checkout", async ({
  page,
}) => {
  await choose(page);
  await page.evaluate(() => {
    const browser = window as Window & {
      paddleTestEvent?: (event: { name: string }) => void;
    };
    browser.paddleTestEvent!({ name: "checkout.closed" });
  });
  await expect(page.getByRole("status")).toContainText("Payment window closed");
  await page
    .getByRole("button", { name: "Open secure checkout", exact: true })
    .click();
  expect((await providerState()).createCount).toBe(1);
  await page.evaluate(() => {
    const browser = window as Window & {
      paddleTestEvent?: (event: { name: string }) => void;
    };
    browser.paddleTestEvent!({ name: "checkout.completed" });
  });
  await expect(page).toHaveURL(/account\/plan\?checkout=returned/);
  await expect(
    page.getByRole("heading", { name: "Free", exact: true }),
  ).toBeVisible();
  const state = await providerState();
  completePayment(state, state.transactions[0].id);
  await save(state);
  await expect(
    page.getByRole("heading", { name: "Premium", exact: true }),
  ).toBeVisible({ timeout: 15000 });
});

test("overdue and paused subscriptions explain the next action while preserving paid access", async ({
  page,
}, info) => {
  await choose(page);
  const state = await providerState();
  completePayment(state, state.transactions[0].id);
  await save(state);
  await page.goto("/en/account/plan?checkout=returned");
  await expect(
    page.getByText("Auto-renewal on", { exact: true }),
  ).toBeVisible();
  const overdue = await providerState();
  overdue.subscriptions[0].status = "past_due";
  overdue.subscriptions[0].updated_at = new Date().toISOString();
  await save(overdue);
  await refresh(page);
  await expect(
    page.getByText("Payment overdue", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Paddle could not collect a payment/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Premium", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("billing-overdue.png"),
    fullPage: true,
    scale: "css",
  });
  const paused = await providerState();
  paused.subscriptions[0].status = "paused";
  paused.subscriptions[0].updated_at = new Date().toISOString();
  await save(paused);
  await refresh(page);
  await expect(page.getByText(/Payments are paused/)).toBeVisible();
  await expect(page.getByText(/Next payment:/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Choose annual", exact: true }),
  ).toHaveCount(0);
});
