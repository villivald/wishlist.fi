import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGoogleRequest,
  finishGoogleSignIn,
  GOOGLE_REAUTH_MS,
} from "@/features/auth/service/google";
import { hashPassword } from "@/features/password/utils/hash-and-verify";

const db = vi.hoisted(() => ({
  session: { findFirst: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  user: { findUniqueOrThrow: vi.fn() },
  googleAuthRequest: { create: vi.fn() },
  authIdentity: { findUnique: vi.fn(), create: vi.fn() },
  accountEmail: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const rateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/features/auth/service/security", () => ({
  lockUser: vi.fn(),
  consumeRateLimit: rateLimit,
}));
vi.mock("@/lib/lucia", () => ({
  createSession: vi.fn(async () => ({ id: "rotated-session" })),
}));

const identity = {
  subject: "attacker-google",
  email: "attacker@gmail.com",
  emailVerified: true,
};
const user = { id: "victim", emailVerified: true, passwordHash: "" };
const session = { id: "stolen-session", userId: user.id, user };
const connect = {
  intent: "connect" as const,
  locale: "en",
  sessionId: session.id,
};

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_AUTH_ENABLED", "1");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
  vi.stubEnv("APP_URL", "https://wishlist.example");
  user.passwordHash = await hashPassword("Existing-password!");
  db.session.findFirst.mockResolvedValue(session);
  db.session.count.mockResolvedValue(1);
  db.user.findUniqueOrThrow.mockResolvedValue(user);
  db.authIdentity.findUnique.mockResolvedValue(null);
  db.accountEmail.findUnique.mockResolvedValue(null);
  db.$transaction.mockImplementation((run) => run(db));
});
afterEach(() => vi.unstubAllEnvs());

describe("Google linking requires an existing credential", () => {
  it.each([undefined, "", "wrong-password", "x".repeat(129)])(
    "rejects session-only or invalid-password enrollment (%s)",
    async (password) => {
      await expect(
        createGoogleRequest({ ...connect, password }),
      ).rejects.toThrow();
      expect(db.googleAuthRequest.create).not.toHaveBeenCalled();
    },
  );

  it("stores confirmation only on the password-verified, session-bound request", async () => {
    const started = await createGoogleRequest({
      ...connect,
      password: "Existing-password!",
    });
    const { data } = db.googleAuthRequest.create.mock.calls[0][0];
    expect(data).toMatchObject({
      intent: "connect",
      sessionId: session.id,
      passwordConfirmedAt: expect.any(Date),
    });
    expect(JSON.stringify(data)).not.toContain("Existing-password!");
    expect(started.url).not.toContain("Existing-password");
    expect(rateLimit).toHaveBeenCalledWith(
      "google-connect",
      user.id,
      5,
      900000,
    );
    await finishGoogleSignIn(identity, data, session.id);
    expect(db.authIdentity.create).toHaveBeenCalledWith({
      data: { provider: "google", subject: identity.subject, userId: user.id },
    });
  });

  it.each([null, undefined, new Date(Date.now() - GOOGLE_REAUTH_MS - 1000)])(
    "rejects callbacks without fresh request-specific confirmation (%s)",
    async (passwordConfirmedAt) => {
      await expect(
        finishGoogleSignIn(
          identity,
          { ...connect, passwordConfirmedAt },
          session.id,
        ),
      ).rejects.toThrow();
      expect(db.authIdentity.create).not.toHaveBeenCalled();
    },
  );

  it("rejects a confirmation presented from another session", async () => {
    await expect(
      finishGoogleSignIn(
        identity,
        { ...connect, passwordConfirmedAt: new Date() },
        "other-session",
      ),
    ).rejects.toThrow();
    expect(db.authIdentity.create).not.toHaveBeenCalled();
  });

  it("rechecks session revocation under the user lock after recovery", async () => {
    db.session.count.mockResolvedValue(0);
    await expect(
      finishGoogleSignIn(
        identity,
        { ...connect, passwordConfirmedAt: new Date() },
        session.id,
      ),
    ).rejects.toThrow();
    expect(db.authIdentity.create).not.toHaveBeenCalled();
  });

  it("does not allow passwordless or revoked sessions to authorize enrollment", async () => {
    db.session.findFirst.mockResolvedValueOnce(null);
    await expect(
      createGoogleRequest({ ...connect, password: "Existing-password!" }),
    ).rejects.toThrow();
    db.session.findFirst.mockResolvedValueOnce({
      ...session,
      user: { ...user, passwordHash: null },
    });
    await expect(
      createGoogleRequest({ ...connect, password: "Existing-password!" }),
    ).rejects.toThrow();
    expect(db.googleAuthRequest.create).not.toHaveBeenCalled();
  });

  it("fails closed when the account password attempt limit is reached", async () => {
    rateLimit.mockRejectedValueOnce(new Error("Too many attempts"));
    await expect(
      createGoogleRequest({ ...connect, password: "Existing-password!" }),
    ).rejects.toThrow();
    expect(db.googleAuthRequest.create).not.toHaveBeenCalled();
  });

  it("does not require or record password confirmation for ordinary sign-in", async () => {
    await createGoogleRequest({ intent: "sign-in", locale: "en" });
    expect(
      db.googleAuthRequest.create.mock.calls[0][0].data.passwordConfirmedAt,
    ).toBeNull();
    expect(db.session.findFirst).not.toHaveBeenCalled();
  });
});
