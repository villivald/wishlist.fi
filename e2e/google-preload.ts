import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createHash } from "node:crypto";
import { assertTestDatabase } from "./environment";

// Only the isolated Playwright server loads this transport; application endpoints remain fixed.
assertTestDatabase(process.env);
if (
  process.env.GOOGLE_CLIENT_ID !==
    "wishlist-fixture.apps.googleusercontent.com" ||
  process.env.GOOGLE_CLIENT_SECRET !== "google-fixture-secret"
)
  throw new Error("Google fixtures require fake credentials");
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(publicKey)),
  kid: "google-fixture",
  alg: "RS256",
  use: "sig",
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.href === "https://www.googleapis.com/oauth2/v3/certs")
    return Response.json({ keys: [jwk] });
  if (url.href !== "https://oauth2.googleapis.com/token")
    return originalFetch(input, init);
  try {
    const body = new URLSearchParams(String(init?.body));
    const code = JSON.parse(
      Buffer.from(body.get("code") ?? "", "base64url").toString(),
    ) as {
      nonce: string;
      challenge: string;
      subject: string;
      email: string;
      hd?: string;
      badAudience?: boolean;
    };
    if (
      body.get("client_id") !== process.env.GOOGLE_CLIENT_ID ||
      body.get("client_secret") !== process.env.GOOGLE_CLIENT_SECRET ||
      code.challenge !==
        createHash("sha256")
          .update(body.get("code_verifier") ?? "")
          .digest("base64url")
    )
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    const jwt = await new SignJWT({
      nonce: code.nonce,
      email: code.email,
      email_verified: true,
      ...(code.hd ? { hd: code.hd } : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid: "google-fixture" })
      .setIssuer("https://accounts.google.com")
      .setAudience(
        code.badAudience ? "another-client" : process.env.GOOGLE_CLIENT_ID!,
      )
      .setSubject(code.subject)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    return Response.json({ id_token: jwt });
  } catch {
    return Response.json({ error: "invalid_grant" }, { status: 400 });
  }
};
