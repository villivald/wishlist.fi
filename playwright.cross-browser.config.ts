import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import baseline from "./playwright.config";

// Firefox 155 otherwise looks up macOS-protected personal app data even with
// a temporary profile. Give this test browser its own app-data root.
// https://github.com/microsoft/playwright/issues/42768
const firefoxEnvironment =
  process.platform === "darwin"
    ? {
        ...process.env,
        CFFIXED_USER_HOME: mkdtempSync(join(tmpdir(), "wishlist-firefox-qa-")),
      }
    : undefined;

export default defineConfig({
  ...baseline,
  testMatch: [
    "**/home-access.spec.ts",
    "**/home-artwork.spec.ts",
    "**/native-forms.spec.ts",
    "**/user-testing.spec.ts",
    "**/filter-controls.spec.ts",
    "**/layout-review.spec.ts",
    "**/localization.spec.ts",
    "**/usability.spec.ts",
    "**/group-reservations.spec.ts",
    "**/guest.spec.ts",
    "**/billing.spec.ts",
    "**/personalization.spec.ts",
    "**/sharing-card-access.spec.ts",
    "**/list-visibility.spec.ts",
    "**/feedback.spec.ts",
    "**/mobile-feedback.spec.ts",
    "**/premium.spec.ts",
  ],
  outputDir: "test-results/cross-browser",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "playwright-report/cross-browser" },
    ],
  ],
  projects: [
    {
      name: "desktop-firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 800 },
        launchOptions: { env: firefoxEnvironment },
      },
    },
    {
      name: "desktop-webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
