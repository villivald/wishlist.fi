import { defineConfig, devices } from "@playwright/test";
import {
  assertTestDatabase,
  testEnvironment,
  testOrigin,
} from "./e2e/environment";
import { paddleEnvironment } from "./e2e/paddle-fixture";

assertTestDatabase(process.env);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  testIgnore: [
    "**/auth-protection.spec.ts",
    "**/billing-live.spec.ts",
    "**/privacy.spec.ts",
  ],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: testOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command:
      "npm run build && node --import tsx --import ./e2e/paddle-preload.ts node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3017",
    url: `${testOrigin}/sign-in`,
    env: { ...testEnvironment, ...paddleEnvironment },
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
