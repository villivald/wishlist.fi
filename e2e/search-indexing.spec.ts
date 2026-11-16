import { expect, test } from "@playwright/test";
import english from "../src/i18n/messages/en.json" with { type: "json" };
import finnish from "../src/i18n/messages/fi.json" with { type: "json" };
import { testOrigin } from "./environment";

test.use({ javaScriptEnabled: false, userAgent: "Twitterbot" });

test("SEO files bypass locale negotiation and list only public marketing pages", async ({
  request,
  page,
}) => {
  const headers = {
    "Accept-Language": "fi",
    Cookie: "wishlist-locale=fi",
  };
  const robots = await request.get("/robots.txt", {
    headers,
    maxRedirects: 0,
  });
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("User-Agent: *\nAllow: /");
  expect(await robots.text()).toContain(`Sitemap: ${testOrigin}/sitemap.xml`);

  const sitemap = await request.get("/sitemap.xml", {
    headers,
    maxRedirects: 0,
  });
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  const entries = await page.evaluate(
    (xml) => {
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.querySelector("parsererror")) throw new Error("Invalid XML");
      return Array.from(document.getElementsByTagName("url"), (entry) => ({
        url: entry.getElementsByTagName("loc")[0]?.textContent,
        languages: Object.fromEntries(
          Array.from(
            entry.getElementsByTagNameNS(
              "http://www.w3.org/1999/xhtml",
              "link",
            ),
            (link) => [
              link.getAttribute("hreflang"),
              link.getAttribute("href"),
            ],
          ),
        ),
      }));
    },
    await sitemap.text(),
  );
  expect(entries.map((entry) => entry.url).sort()).toEqual(
    ["/en", "/fi", "/en/premium", "/fi/premium"]
      .map((path) => `${testOrigin}${path}`)
      .sort(),
  );
  for (const entry of entries) {
    const suffix = entry.url?.endsWith("/premium") ? "/premium" : "";
    expect(entry.languages).toEqual({
      en: `${testOrigin}/en${suffix}`,
      fi: `${testOrigin}/fi${suffix}`,
    });
  }
});

for (const locale of ["en", "fi"] as const) {
  const copy = locale === "fi" ? finnish : english;

  test(`${locale}: marketing pages expose localized search metadata without JavaScript`, async ({
    page,
  }) => {
    for (const [path, title, description] of [
      [
        "",
        "Create and share your wishlist",
        "Collect the things you love, share a list with your people, and make finding the right gift a little easier.",
      ],
      [
        "/premium",
        "Free and Premium",
        "Choose an illustrated theme, download a QR sharing card, and decide who can see your lists.",
      ],
    ] as const) {
      const response = await page.goto(`/${locale}${path}?utm_source=test`);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveTitle(`${copy[title]} · Wishlist`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(
        page.locator('head meta[name="description"]'),
      ).toHaveAttribute("content", copy[description]);
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${testOrigin}/${locale}${path}`,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      expect(response?.headers().link).toContain('hreflang="fi"');
      expect(response?.headers().link).toContain('hreflang="en"');
    }
  });

  test(`${locale}: authentication canonicals exclude return destinations and status parameters`, async ({
    page,
  }) => {
    for (const path of ["sign-in", "sign-up"]) {
      await page.goto(
        `/${locale}/${path}?returnTo=%2F${locale}%2Flists&google=cancelled`,
      );
      await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
      await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
        "href",
        `${testOrigin}/${locale}/${path}`,
      );
    }
  });

  test(`${locale}: discovery and information pages retain their indexing exclusions`, async ({
    page,
  }) => {
    for (const path of ["browse", "privacy", "about"]) {
      await page.goto(`/${locale}/${path}`);
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    }
  });
}
