export const testDatabaseUrl =
  "postgresql://wishlist_test:wishlist-test-only@127.0.0.1:55433/wishlist_test?schema=wishlist";

export const testOrigin = "http://127.0.0.1:3017";

export const testEnvironment = {
  ...Object.fromEntries(
    ["SANDBOX", "LIVE"].flatMap((environment) =>
      [
        "API_KEY",
        "CLIENT_TOKEN",
        "WEBHOOK_SECRET",
        "MONTHLY_PRICE_ID",
        "ANNUAL_PRICE_ID",
      ].map((name) => [`PADDLE_${environment}_${name}`, ""]),
    ),
  ),
  PADDLE_CHECKOUT_ENABLED: "",
  PADDLE_CHECKOUT_TESTER_IDS: "",
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_API_KEY: "",
  PADDLE_CLIENT_TOKEN: "",
  PADDLE_WEBHOOK_SECRET: "",
  PADDLE_MONTHLY_PRICE_ID: "",
  PADDLE_ANNUAL_PRICE_ID: "",
  MEDIA_STORAGE: "local",
  MEDIA_LOCAL_NAMESPACE: "test",
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
  APP_URL: testOrigin,
  GOOGLE_AUTH_ENABLED: "0",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  MAILPIT_URL: "http://127.0.0.1:8026",
  INNGEST_DEV: "1",
  INNGEST_BASE_URL: "http://127.0.0.1:8289",
  INNGEST_EVENT_KEY: "",
  INNGEST_SIGNING_KEY: "",
  RESEND_API_KEY: "re_e2e_not_a_real_key",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  TURNSTILE_SECRET_KEY: "",
  OPERATOR_LEGAL_NAME: "Fixture Operator",
  EMAIL_FROM: "Wishlist Tests <noreply@example.test>",
};

export const assertTestDatabase = (
  environment: Readonly<Record<string, string | undefined>>,
) => {
  if (
    environment.DATABASE_URL !== testDatabaseUrl ||
    environment.DIRECT_URL !== testDatabaseUrl
  ) {
    throw new Error(
      "Database setup is restricted to the isolated wishlist_test database and wishlist schema. Use npm run test:e2e.",
    );
  }
};
