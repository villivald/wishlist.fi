import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";
import crossBrowser from "./playwright.cross-browser.config";

const webServer = baseline.webServer;
if (!webServer || Array.isArray(webServer))
  throw new Error("Privacy tests require the local test web server.");

export default defineConfig({
  ...baseline,
  testMatch: "**/privacy.spec.ts",
  testIgnore: [],
  projects: [...(baseline.projects ?? []), ...(crossBrowser.projects ?? [])],
  outputDir: "test-results/privacy",
  webServer: {
    ...webServer,
    env: { ...webServer.env, VERCEL_ENV: "production" },
  },
});
