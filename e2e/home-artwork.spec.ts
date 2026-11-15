import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectImageLoaded } from "./image-assertions";

const approvedHeroes = {
  h01: "hero-hilma-childhood.webp",
  h06: "hero-shin-bijutsukai-0089.webp",
  h09: "hero-redon-flowers.webp",
};

for (const locale of ["en", "fi"]) {
  test(`${locale}: archive artwork hydrates consistently and fits responsive layouts`, async ({
    page,
  }, info) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const response = await page.goto(`/${locale}`);
    expect(response?.ok()).toBe(true);
    const html = await response!.text();
    const serverId = html.match(/data-hero-artwork="(h\d+)"/)?.[1];
    expect(Object.keys(approvedHeroes)).toContain(serverId);
    const hero = page.locator("[data-hero-artwork]");
    await expect(hero).toHaveAttribute("data-hero-artwork", serverId!);
    const heroImage = hero.locator("img");
    expect(
      decodeURIComponent((await heroImage.getAttribute("src"))!),
    ).toContain(approvedHeroes[serverId as keyof typeof approvedHeroes]);
    await expectImageLoaded(heroImage);
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(
      1,
    );

    const examples = page.locator(
      '[aria-labelledby="example-wishlist-heading"] img',
    );
    await expect(examples).toHaveCount(3);
    for (const [index, file] of [
      "peto-books.webp",
      "causey-cup-and-saucer.webp",
      "wirt-tulips.webp",
    ].entries()) {
      const image = examples.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expectImageLoaded(image);
      expect(decodeURIComponent((await image.getAttribute("src"))!)).toContain(
        file,
      );
    }

    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 850 });
      for (const dark of [false, true]) {
        await page.evaluate(
          ({ dark, width }) => {
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.style.fontSize =
              width === 320 ? "200%" : "";
          },
          { dark, width },
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await expect(hero).toHaveAttribute("data-hero-artwork", serverId!);
        for (const image of await examples.all()) {
          const frame = await image.boundingBox();
          expect(frame).not.toBeNull();
          expect(frame!.width / frame!.height).toBeCloseTo(4 / 3, 1);
        }
        if (width === 1280 || width === 320) {
          expect(
            (await new AxeBuilder({ page }).include("main").analyze())
              .violations,
          ).toEqual([]);
        }
        if (!dark && width !== 390) {
          await page.screenshot({
            path: info.outputPath(`home-${locale}-${width}.png`),
            fullPage: true,
          });
        }
      }
    }
    expect(browserErrors).toEqual([]);
  });
}
