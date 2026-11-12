import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { queueAccountEmail } from "@/features/notifications/service/queue";
import type { Prisma } from "@/generated/prisma/client";
import { localizedPath, resolveLocale } from "@/i18n/config";
import {
  backgroundEvents,
  publishBackgroundEvents,
} from "@/lib/background-events";
import { createSession } from "@/lib/lucia";
import { prisma } from "@/lib/prisma";
import { accountDeletePath, accountProfilePath, listsPath } from "@/paths";
import { generateRandomToken, hashToken } from "@/utils/crypto";
import { safeReturnTo } from "../utils/return-to";
import { lockUser } from "./security";

export const GOOGLE_FLOW_COOKIE = "wishlist-google-state";
export const GOOGLE_FLOW_SECONDS = 600;
export const GOOGLE_REAUTH_MS = 5 * 60 * 1000;
export const hasRecentGoogleConfirmation = (confirmedAt: Date | null) =>
  !!confirmedAt && confirmedAt.getTime() > Date.now() - GOOGLE_REAUTH_MS;
export type GoogleIntent = "sign-in" | "connect" | "delete";
export class GoogleAuthError extends Error {
  constructor(public readonly code: "failed" | "link-required" = "failed") {
    super("Google authentication failed");
  }
}

export const googleConfig = () => {
  const {
    GOOGLE_AUTH_ENABLED,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    APP_URL,
  } = process.env;
  if (
    GOOGLE_AUTH_ENABLED !== "1" ||
    !GOOGLE_CLIENT_ID ||
    !GOOGLE_CLIENT_SECRET ||
    !APP_URL
  )
    return null;
  try {
    const url = new URL(APP_URL);
    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      return null;
    return {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      origin: url.origin,
      redirectUri: `${url.origin}/api/auth/google/callback`,
    };
  } catch {
    return null;
  }
};

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 5000 },
);
const identitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().trim().toLowerCase().email().max(254),
  email_verified: z.boolean(),
  hd: z.string().min(1).optional(),
});
export type GoogleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
};

export const verifyGoogleToken = async (idToken: string, nonce: string) => {
  const config = googleConfig();
  if (!config) throw new GoogleAuthError();
  const { payload } = await jwtVerify(idToken, googleKeys, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: config.clientId,
    requiredClaims: ["sub", "email", "email_verified", "nonce", "iat", "exp"],
    maxTokenAge: "10m",
    clockTolerance: 30,
  });
  if (
    payload.nonce !== nonce ||
    (payload.azp !== undefined && payload.azp !== config.clientId) ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== config.clientId)
  )
    throw new GoogleAuthError();
  const identity = identitySchema.parse(payload);
  return {
    subject: identity.sub,
    email: identity.email,
    // Google is not authoritative for an external mailbox merely verified in the past.
    emailVerified:
      identity.email_verified &&
      (identity.email.endsWith("@gmail.com") || !!identity.hd),
  } satisfies GoogleIdentity;
};

export const exchangeGoogleCode = async (
  code: string,
  codeVerifier: string,
  nonce: string,
) => {
  const config = googleConfig();
  if (!config) throw new GoogleAuthError();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new GoogleAuthError();
  const tokens = z
    .object({ id_token: z.string().min(1).max(16_384) })
    .parse(await response.json());
  return verifyGoogleToken(tokens.id_token, nonce);
};

export const createGoogleRequest = async ({
  locale,
  returnTo,
  intent,
  sessionId,
}: {
  locale: string;
  returnTo?: unknown;
  intent: GoogleIntent;
  sessionId?: string;
}) => {
  const config = googleConfig();
  if (!config || (intent !== "sign-in" && !sessionId))
    throw new GoogleAuthError();
  const state = generateRandomToken();
  const codeVerifier = randomBytes(32).toString("base64url");
  const nonce = generateRandomToken();
  const destination =
    intent === "connect"
      ? accountProfilePath
      : intent === "delete"
        ? accountDeletePath
        : safeReturnTo(returnTo);
  await prisma.googleAuthRequest.create({
    data: {
      stateHash: hashToken(state),
      codeVerifier,
      nonce,
      locale: resolveLocale(locale),
      returnTo: destination,
      intent,
      sessionId: sessionId ?? null,
      expiresAt: new Date(Date.now() + GOOGLE_FLOW_SECONDS * 1000),
    },
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    code_challenge: createHash("sha256")
      .update(codeVerifier)
      .digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { state, url: url.toString() };
};

export const consumeGoogleRequest = async (
  state: string,
  cookie: string | undefined,
) => {
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(state) || state !== cookie)
    throw new GoogleAuthError();
  return prisma.$transaction(async (tx) => {
    const flow = await tx.googleAuthRequest.findUnique({
      where: { stateHash: hashToken(state) },
    });
    if (!flow) throw new GoogleAuthError();
    const consumed = await tx.googleAuthRequest.deleteMany({
      where: { stateHash: flow.stateHash, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new GoogleAuthError();
    return flow;
  });
};

export const readAccountSecurity = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      passwordHash: true,
      identities: { where: { provider: "google" }, select: { subject: true } },
    },
  });
  return {
    hasPassword: user.passwordHash !== null,
    googleConnected: user.identities.length > 0,
  };
};

const availableGoogleUsername = async (
  tx: Prisma.TransactionClient,
  locale: string,
) => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const username = `${resolveLocale(locale) === "fi" ? "toive" : "wish"}-${randomInt(100_000, 1_000_000)}`;
    if (!(await tx.user.count({ where: { username } }))) return username;
  }
  throw new GoogleAuthError();
};

export const finishGoogleSignIn = async (
  identity: GoogleIdentity,
  flow: { intent: string; locale: string; sessionId: string | null },
  currentSessionId?: string,
) => {
  const token = generateRandomToken();
  const result = await prisma.$transaction(async (tx) => {
    // Serializes identity creation/linking across callbacks, including duplicate emails.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(8109, 1)::text`;
    const linked = await tx.authIdentity.findUnique({
      where: {
        provider_subject: { provider: "google", subject: identity.subject },
      },
      include: { user: true },
    });
    let user = linked?.user;
    if (flow.intent !== "sign-in") {
      if (!flow.sessionId || flow.sessionId !== currentSessionId)
        throw new GoogleAuthError();
      const existing = await tx.session.findFirst({
        where: {
          id: flow.sessionId,
          expiresAt: { gt: new Date() },
          user: { emailVerified: true },
        },
        include: { user: true },
      });
      if (!existing || (linked && linked.userId !== existing.userId))
        throw new GoogleAuthError();
      await lockUser(tx, existing.userId);
      // Recheck after waiting for account deletion or a password change.
      if (
        !(await tx.session.count({
          where: { id: existing.id, expiresAt: { gt: new Date() } },
        }))
      )
        throw new GoogleAuthError();
      if (flow.intent === "delete" && !linked) throw new GoogleAuthError();
      user = existing.user;
      if (!linked)
        await tx.authIdentity.create({
          data: {
            provider: "google",
            subject: identity.subject,
            userId: user.id,
          },
        });
    } else if (!user) {
      if (
        await tx.user.findUnique({
          where: { email: identity.email },
          select: { id: true },
        })
      )
        throw new GoogleAuthError("link-required");
      user = await tx.user.create({
        data: {
          username: await availableGoogleUsername(tx, flow.locale),
          email: identity.email,
          emailVerified: identity.emailVerified,
          locale: resolveLocale(flow.locale),
          identities: {
            create: { provider: "google", subject: identity.subject },
          },
        },
      });
      if (user.emailVerified)
        await queueAccountEmail(tx, user, { key: `welcome/${user.id}` });
    }
    if (!user) throw new GoogleAuthError();
    await lockUser(tx, user.id);
    // A linked identity is stable even if the provider's email later changes.
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const session = await createSession(token, current.id, tx);
    if (flow.intent === "delete")
      await tx.session.update({
        where: { id: session.id },
        data: { googleReauthenticatedAt: new Date() },
      });
    if (flow.sessionId)
      await tx.session.deleteMany({ where: { id: flow.sessionId } });
    return { user: current, session };
  });
  // Existing queue deduplication prevents repeat welcome messages on later sign-ins.
  if (result.user.emailVerified) {
    const email = await prisma.accountEmail.findUnique({
      where: { key: `welcome/${result.user.id}` },
      select: { id: true, sentAt: true },
    });
    if (email && !email.sentAt)
      await publishBackgroundEvents(backgroundEvents.accountEmail, [email.id]);
  }
  return { ...result, token };
};

export const googleDestination = (
  locale: string,
  returnTo: string = listsPath,
) => localizedPath(safeReturnTo(returnTo), locale);
