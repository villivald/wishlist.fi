import { defineConfig } from "@playwright/test";
import { livePaddleEnvironment } from "./e2e/paddle-fixture";
import base from "./playwright.config";

const server = Array.isArray(base.webServer)
  ? base.webServer[0]
  : base.webServer;
if (!server) throw new Error("Isolated browser test server is required");
export default defineConfig({
  ...base,
  testMatch: "**/billing-live.spec.ts",
  testIgnore: [],
  webServer: {
    ...server,
    env: {
      ...server.env,
      ...livePaddleEnvironment,
      PADDLE_CHECKOUT_TESTER_IDS: "e2e-owner",
    },
  },
});
