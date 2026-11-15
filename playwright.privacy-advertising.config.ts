import { defineConfig } from "@playwright/test";
import privacy from "./playwright.privacy.config";

const webServer = privacy.webServer;
if (!webServer || Array.isArray(webServer))
  throw new Error("Privacy tests require the local test web server.");

export default defineConfig({
  ...privacy,
  metadata: { advertisingEnabled: true },
  outputDir: "test-results/privacy-advertising",
  webServer: {
    ...webServer,
    env: { ...webServer.env, GOOGLE_TAG_MANAGER_ENABLED: "1" },
  },
});
