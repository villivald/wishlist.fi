import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  deleteAccount,
  readDeletionImpact,
} from "@/features/account/service/account";
import { authenticate, verifyEmail } from "@/features/auth/service/accounts";
import {
  consumeGoogleRequest,
  createGoogleRequest,
  finishGoogleSignIn,
} from "@/features/auth/service/google";
import { generateEmailVerificationCode } from "@/features/auth/utils/generate-email-verification-code";
import { validateSession } from "@/lib/lucia";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/utils/crypto";
import { assertTestDatabase } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

assertTestDatabase(process.env);
const identity = {
  subject: "e2e-google-subject",
  email: "e2e-google-user@gmail.com",
  emailVerified: true,
};
const signIn = { intent: "sign-in", locale: "fi", sessionId: null };
beforeEach(async () => {
  await resetFixtures();
  await prisma.googleAuthRequest.deleteMany();
  vi.stubEnv("GOOGLE_AUTH_ENABLED", "1");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await resetFixtures();
  await prisma.$disconnect();
});

describe("Google account and session invariants", () => {
  it("creates a passwordless account once, keeps its email private, and identifies returning users by subject", async () => {
    const first = await finishGoogleSignIn(identity, signIn);
    expect(first.user).toMatchObject({
      passwordHash: null,
      emailVerified: true,
      locale: "fi",
      name: null,
    });
    expect(first.user.username).toMatch(/^toive-[1-9][0-9]{5}$/);
    const returning = await finishGoogleSignIn(
      { ...identity, email: "e2e-google-changed@gmail.com" },
      signIn,
    );
    expect(returning.user.id).toBe(first.user.id);
    expect(returning.user.email).toBe(identity.email);
    expect(returning.user.username).toBe(first.user.username);
    expect(
      await prisma.accountEmail.count({
        where: { key: `welcome/${first.user.id}` },
      }),
    ).toBe(1);
    expect((await validateSession(returning.token)).user?.id).toBe(
      first.user.id,
    );
    await expect(
      authenticate(identity.email, "Any-password-value!"),
    ).rejects.toThrow("Incorrect email or password");
  });
  it("never links by email alone and allows an explicit link only from the bound authenticated session", async () => {
    const login = await authenticate(
      accounts.owner.email,
      accounts.owner.password,
    );
    const sameEmail = { ...identity, email: accounts.owner.email };
    await expect(finishGoogleSignIn(sameEmail, signIn)).rejects.toMatchObject({
      code: "link-required",
    });
    const connect = {
      ...signIn,
      intent: "connect",
      sessionId: login.session.id,
    };
    await expect(
      finishGoogleSignIn(sameEmail, connect, "wrong-session"),
    ).rejects.toThrow();
    const linked = await finishGoogleSignIn(
      sameEmail,
      connect,
      login.session.id,
    );
    expect(linked.user.id).toBe("e2e-owner");
    expect(linked.user.passwordHash).not.toBeNull();
    expect((await validateSession(login.token)).user).toBeNull();
    expect((await finishGoogleSignIn(sameEmail, signIn)).user.id).toBe(
      "e2e-owner",
    );
    const member = await authenticate(
      accounts.member.email,
      accounts.member.password,
    );
    await expect(
      finishGoogleSignIn(
        sameEmail,
        { ...connect, sessionId: member.session.id },
        member.session.id,
      ),
    ).rejects.toThrow();
  });
  it("does not promote external mailbox ownership without local verification", async () => {
    const external = await finishGoogleSignIn(
      {
        ...identity,
        email: "e2e-google-external@example.test",
        emailVerified: false,
      },
      signIn,
    );
    expect(external.user.emailVerified).toBe(false);
    expect(
      await prisma.accountEmail.count({ where: { userId: external.user.id } }),
    ).toBe(0);
    const code = await generateEmailVerificationCode(
      external.user.id,
      external.user.email,
    );
    await verifyEmail(external.user.id, external.user.email, code);
    const again = await finishGoogleSignIn(
      { ...identity, email: external.user.email, emailVerified: false },
      signIn,
    );
    expect(again.user.emailVerified).toBe(true);
    expect(
      await prisma.accountEmail.count({ where: { userId: external.user.id } }),
    ).toBe(1);
  });
  it("requires fresh linked-Google confirmation for passwordless deletion and rejects a different identity", async () => {
    const login = await finishGoogleSignIn(identity, signIn);
    const input = {
      confirmation: "DELETE",
      impactToken: (await readDeletionImpact(login.user.id)).impactToken,
    };
    await expect(
      deleteAccount(login.user.id, login.session.id, input),
    ).rejects.toThrow("Confirm with Google again");
    const flow = { ...signIn, intent: "delete", sessionId: login.session.id };
    await expect(
      finishGoogleSignIn(
        { ...identity, subject: "another-google-user" },
        flow,
        login.session.id,
      ),
    ).rejects.toThrow();
    const confirmed = await finishGoogleSignIn(
      identity,
      flow,
      login.session.id,
    );
    await prisma.session.update({
      where: { id: confirmed.session.id },
      data: { googleReauthenticatedAt: new Date(Date.now() - 6 * 60_000) },
    });
    await expect(
      deleteAccount(login.user.id, confirmed.session.id, input),
    ).rejects.toThrow("Confirm with Google again");
    const fresh = await finishGoogleSignIn(
      identity,
      { ...flow, sessionId: confirmed.session.id },
      confirmed.session.id,
    );
    await deleteAccount(login.user.id, fresh.session.id, input);
    expect(
      await prisma.authIdentity.count({ where: { subject: identity.subject } }),
    ).toBe(0);
    expect((await validateSession(fresh.token)).user).toBeNull();
  });
  it("revoked sessions cannot connect identities", async () => {
    const login = await authenticate(
      accounts.owner.email,
      accounts.owner.password,
    );
    await prisma.session.delete({ where: { id: login.session.id } });
    await expect(
      finishGoogleSignIn(
        identity,
        { ...signIn, intent: "connect", sessionId: login.session.id },
        login.session.id,
      ),
    ).rejects.toThrow();
    expect(await prisma.authIdentity.count()).toBe(0);
  });
});

describe("single-use browser-bound OAuth requests", () => {
  it("rejects cross-browser state and consumes a valid request exactly once under concurrency", async () => {
    const flow = await createGoogleRequest({
      locale: "fi",
      returnTo: "https://attacker.test",
      intent: "sign-in",
    });
    const url = new URL(flow.url);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email");
    await expect(
      consumeGoogleRequest(flow.state, "another-browser"),
    ).rejects.toThrow();
    const attempts = await Promise.allSettled([
      consumeGoogleRequest(flow.state, flow.state),
      consumeGoogleRequest(flow.state, flow.state),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const result = attempts.find((value) => value.status === "fulfilled");
    if (result?.status === "fulfilled")
      expect(result.value).toMatchObject({ returnTo: "/lists", locale: "fi" });
  });
  it("rejects expired authorization requests", async () => {
    const flow = await createGoogleRequest({ locale: "en", intent: "sign-in" });
    await prisma.googleAuthRequest.update({
      where: { stateHash: hashToken(flow.state) },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      consumeGoogleRequest(flow.state, flow.state),
    ).rejects.toThrow();
  });
});
