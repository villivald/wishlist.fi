import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  googleConfig,
  verifyGoogleToken,
} from "@/features/auth/service/google";

let key: CryptoKey;
let otherKey: CryptoKey;
beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  key = keys.privateKey;
  otherKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "unit-google",
    alg: "RS256",
    use: "sig",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
});
beforeEach(() => {
  vi.stubEnv("GOOGLE_AUTH_ENABLED", "1");
  vi.stubEnv("GOOGLE_CLIENT_ID", "unit-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "unit-secret");
  vi.stubEnv("APP_URL", "https://wishlist.example");
});
afterEach(() => vi.unstubAllEnvs());

const token = (claims: Record<string, unknown> = {}, signingKey?: CryptoKey) =>
  new SignJWT({
    iss: "https://accounts.google.com",
    aud: "unit-client",
    sub: "google-subject",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: "browser-nonce",
    email: "someone@gmail.com",
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "unit-google" })
    .sign(signingKey ?? key);

describe("Google identity validation", () => {
  it("accepts a signed identity and treats external email ownership conservatively", async () => {
    expect(await verifyGoogleToken(await token(), "browser-nonce")).toEqual({
      subject: "google-subject",
      email: "someone@gmail.com",
      emailVerified: true,
    });
    expect(
      (
        await verifyGoogleToken(
          await token({ email: "person@example.org" }),
          "browser-nonce",
        )
      ).emailVerified,
    ).toBe(false);
    expect(
      (
        await verifyGoogleToken(
          await token({ email: "person@example.org", hd: "example.org" }),
          "browser-nonce",
        )
      ).emailVerified,
    ).toBe(true);
    expect(
      (
        await verifyGoogleToken(
          await token({ email_verified: false }),
          "browser-nonce",
        )
      ).emailVerified,
    ).toBe(false);
  });
  for (const [name, claims] of Object.entries({
    issuer: { iss: "https://attacker.example" },
    audience: { aud: "another-client" },
    expired: { exp: Math.floor(Date.now() / 1000) - 60 },
    future: { iat: Math.floor(Date.now() / 1000) + 300 },
    nonce: { nonce: "another-browser" },
    authorizedParty: { azp: "another-client" },
    multipleAudiences: { aud: ["unit-client", "another-client"] },
    unverifiedString: { email_verified: "true" },
    invalidEmail: { email: "invalid" },
    missingSubject: { sub: undefined },
  }))
    it(`rejects ${name}`, async () => {
      await expect(
        verifyGoogleToken(await token(claims), "browser-nonce"),
      ).rejects.toThrow();
    });
  it("rejects a forged signature even with otherwise correct claims", async () => {
    await expect(
      verifyGoogleToken(await token({}, otherKey), "browser-nonce"),
    ).rejects.toThrow();
  });
});

describe("explicit provider configuration", () => {
  it("requires opt-in, both credentials and a trustworthy canonical origin", () => {
    expect(googleConfig()?.redirectUri).toBe(
      "https://wishlist.example/api/auth/google/callback",
    );
    vi.stubEnv("APP_URL", "http://attacker.example");
    expect(googleConfig()).toBeNull();
    vi.stubEnv("APP_URL", "https://user:secret@wishlist.example");
    expect(googleConfig()).toBeNull();
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(googleConfig()?.origin).toBe("http://localhost:3000");
    vi.stubEnv("GOOGLE_AUTH_ENABLED", "0");
    expect(googleConfig()).toBeNull();
    vi.stubEnv("GOOGLE_AUTH_ENABLED", "1");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleConfig()).toBeNull();
  });
});
