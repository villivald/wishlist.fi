import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  deleteAccount,
  readDeletionImpact,
} from "@/features/account/service/account";
import { authenticate } from "@/features/auth/service/accounts";
import {
  readPremiumAccess,
  requirePremium,
} from "@/features/premium/service/entitlements";
import { lockPremiumWishlist } from "@/features/premium/service/list-policy";
import {
  issuePromo,
  listPromos,
  redeemPromo,
  revokePromo,
} from "@/features/premium/service/promotions";
import { reserveWish } from "@/features/reservation/service/reservations";
import { readWishlist } from "@/features/wishlist/service/lists";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

assertTestDatabase(process.env);
beforeEach(resetFixtures);
afterAll(async () => {
  await resetFixtures();
  await prisma.$disconnect();
});

const dayMs = 86400000;
const login = (role: keyof typeof accounts = "owner") =>
  authenticate(accounts[role].email, accounts[role].password);
const issue = (maxRedemptions = 10) =>
  issuePromo({
    label: "e2e-trial",
    durationDays: 30,
    validForDays: 7,
    maxRedemptions,
  });
const grant = (
  userId: string,
  startsIn: number,
  endsIn: number,
  revokedAt: Date | null = null,
) => {
  const now = Date.now();
  return prisma.premiumGrant.create({
    data: {
      userId,
      startsAt: new Date(now + startsIn),
      expiresAt: new Date(now + endsIn),
      revokedAt,
    },
  });
};
const gate = (actorId: string) =>
  prisma.$transaction((tx) =>
    lockPremiumWishlist(tx, "e2e-private-list", actorId),
  );

describe("Premium and promotions", () => {
  it("issues and redeems a normalized campaign code without bypassing usage limits", async () => {
    const account = await login();
    const input = {
      label: "e2e-print-campaign",
      code: "wishlist-30",
      durationDays: 30,
      validForDays: 365,
      maxRedemptions: 1,
    };
    const promo = await issuePromo(input);
    expect(promo.code).toBe("WISHLIST30");
    expect(promo.expiresAt.getTime() - Date.now()).toBeCloseTo(365 * dayMs, -4);
    await expect(
      issuePromo({ ...input, code: "WISHLIST30" }),
    ).rejects.toThrow();
    const stored = await prisma.promoCode.findUniqueOrThrow({
      where: { id: promo.id },
    });
    expect(JSON.stringify(stored)).not.toContain(promo.code);
    expect(stored.redemptionCount).toBe(0);

    const result = await redeemPromo(
      account.user.id,
      account.session.id,
      " wishlist-30 ",
    );
    expect(result.expiresAt.getTime() - Date.now()).toBeCloseTo(30 * dayMs, -4);
    const member = await login("member");
    await expect(
      redeemPromo(member.user.id, member.session.id, "WISHLIST30"),
    ).rejects.toThrow("unavailable");
    expect(
      await prisma.promoCode.findUnique({ where: { id: promo.id } }),
    ).toMatchObject({ redemptionCount: 1, maxRedemptions: 1 });
  });

  it("defaults to Free and stores only the code hash while granting the authenticated account", async () => {
    const account = await login();
    expect(await readPremiumAccess(account.user.id)).toEqual({
      plan: "FREE",
      expiresAt: null,
      nextStartsAt: null,
    });
    const promo = await issue();
    const stored = await prisma.promoCode.findUniqueOrThrow({
      where: { id: promo.id },
    });
    expect(stored.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(promo.code);
    const result = await redeemPromo(
      account.user.id,
      account.session.id,
      promo.code.toLowerCase(),
    );
    expect(await requirePremium(account.user.id)).toMatchObject({
      plan: "PREMIUM",
      expiresAt: result.expiresAt,
    });
    expect((await readPremiumAccess("e2e-member")).plan).toBe("FREE");
    expect(result.expiresAt.getTime() - Date.now()).toBeCloseTo(30 * dayMs, -4);
    expect(JSON.stringify(await listPromos(1))).not.toContain(stored.codeHash);
  });

  it("serializes simultaneous repeated redemption into exactly one grant", async () => {
    const account = await login();
    const promo = await issue();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        redeemPromo(account.user.id, account.session.id, promo.code),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await prisma.premiumGrant.count()).toBe(1);
    expect(
      await prisma.promoCode.findUnique({ where: { id: promo.id } }),
    ).toMatchObject({ redemptionCount: 1 });
    await expect(
      redeemPromo(account.user.id, account.session.id, promo.code),
    ).rejects.toThrow("already redeemed");
  });

  it("does not overspend a shared code when different accounts race for the last uses", async () => {
    const owner = await login();
    const promo = await issue(3);
    const ids = Array.from({ length: 10 }, (_, index) => `e2e-promo-${index}`);
    await prisma.user.createMany({
      data: ids.map((id) => ({
        id,
        username: id,
        email: `${id}@example.test`,
        emailVerified: true,
        passwordHash: owner.user.passwordHash,
      })),
    });
    await prisma.session.createMany({
      data: ids.map((id) => ({
        id: `${id}-session`,
        userId: id,
        expiresAt: new Date(Date.now() + dayMs),
      })),
    });
    const results = await Promise.allSettled(
      ids.map((id) => redeemPromo(id, `${id}-session`, promo.code)),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(3);
    expect(await prisma.premiumGrant.count()).toBe(3);
    expect(
      await prisma.promoCode.findUnique({ where: { id: promo.id } }),
    ).toMatchObject({ redemptionCount: 3 });
  });

  it("stacks concurrent different codes without losing days or granting overlapping promo periods", async () => {
    const account = await login();
    const promos = await Promise.all([issue(), issue()]);
    await Promise.all(
      promos.map((promo) =>
        redeemPromo(account.user.id, account.session.id, promo.code),
      ),
    );
    const periods = await prisma.premiumGrant.findMany({
      orderBy: { startsAt: "asc" },
    });
    expect(periods).toHaveLength(2);
    expect(periods[0].expiresAt).toEqual(periods[1].startsAt);
    expect(periods[1].expiresAt.getTime() - periods[0].startsAt.getTime()).toBe(
      60 * dayMs,
    );
    expect((await readPremiumAccess(account.user.id)).expiresAt).toEqual(
      periods[1].expiresAt,
    );
  });

  it("ignores revoked and expired grants, keeps gaps, and combines independent overlapping periods", async () => {
    await grant("e2e-owner", -dayMs, -1);
    await grant("e2e-owner", -dayMs, dayMs, new Date());
    const future = await grant("e2e-owner", dayMs, 2 * dayMs);
    expect(await readPremiumAccess("e2e-owner")).toEqual({
      plan: "FREE",
      expiresAt: null,
      nextStartsAt: future.startsAt,
    });
    const active = await grant("e2e-owner", -dayMs, dayMs / 2);
    expect((await readPremiumAccess("e2e-owner")).expiresAt).toEqual(
      active.expiresAt,
    );
    await grant("e2e-owner", 0, 1.5 * dayMs);
    expect((await readPremiumAccess("e2e-owner")).expiresAt).toEqual(
      future.expiresAt,
    );
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { emailVerified: false },
    });
    await expect(requirePremium("e2e-owner")).rejects.toThrow("Active Premium");
  });

  it.each(["expired", "revoked", "exhausted", "unknown"])(
    "rejects %s codes without creating grants",
    async (state) => {
      const account = await login();
      const promo = await issue();
      if (state === "expired") {
        await prisma.promoCode.update({
          where: { id: promo.id },
          data: {
            createdAt: new Date(Date.now() - 2 * dayMs),
            expiresAt: new Date(Date.now() - dayMs),
          },
        });
      } else if (state === "revoked") {
        await revokePromo(promo.id);
      } else if (state === "exhausted") {
        await prisma.promoCode.update({
          where: { id: promo.id },
          data: { redemptionCount: 10 },
        });
      }
      await expect(
        redeemPromo(
          account.user.id,
          account.session.id,
          state === "unknown" ? `WL${"A".repeat(32)}` : promo.code,
        ),
      ).rejects.toThrow("This promo code is unavailable");
      expect(await prisma.premiumGrant.count()).toBe(0);
    },
  );

  it("honors granted access after the issuing code is revoked", async () => {
    const account = await login();
    const member = await login("member");
    const promo = await issue();
    const result = await redeemPromo(
      account.user.id,
      account.session.id,
      promo.code,
    );
    await revokePromo(promo.id);
    await expect(
      redeemPromo(member.user.id, member.session.id, promo.code),
    ).rejects.toThrow("unavailable");
    expect((await readPremiumAccess(account.user.id)).expiresAt).toEqual(
      result.expiresAt,
    );
  });

  it("requires the same verified account and a current session", async () => {
    const account = await login();
    const member = await login("member");
    const promo = await issue();
    await expect(
      redeemPromo(account.user.id, member.session.id, promo.code),
    ).rejects.toThrow("session expired");
    await prisma.session.update({
      where: { id: account.session.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      redeemPromo(account.user.id, account.session.id, promo.code),
    ).rejects.toThrow("session expired");
    await prisma.user.update({
      where: { id: member.user.id },
      data: { emailVerified: false },
    });
    await expect(
      redeemPromo(member.user.id, member.session.id, promo.code),
    ).rejects.toThrow("session expired");
    expect(await prisma.premiumGrant.count()).toBe(0);
  });

  it("rate limits guessing even when input is malformed", async () => {
    const account = await login();
    const promo = await issue();
    for (let index = 0; index < 5; index++) {
      await expect(
        redeemPromo(account.user.id, account.session.id, "bad"),
      ).rejects.toThrow("unavailable");
    }
    await expect(
      redeemPromo(account.user.id, account.session.id, promo.code),
    ).rejects.toThrow("Too many attempts");
    expect(await prisma.premiumGrant.count()).toBe(0);
  });

  it("checks the owner's plan and admin role without taking away existing private access on expiry", async () => {
    await grant("e2e-owner", -dayMs, dayMs);
    await expect(gate("e2e-owner")).rejects.toThrow();
    await prisma.membership.create({
      data: {
        userId: "e2e-owner",
        wishlistId: "e2e-private-list",
        role: "ADMIN",
      },
    });
    await expect(gate("e2e-owner")).rejects.toThrow("Active Premium");
    const ownerGrant = await grant("e2e-member", -dayMs, dayMs);
    await prisma.premiumGrant.deleteMany({ where: { userId: "e2e-owner" } });
    await gate("e2e-owner");
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { publication: "PUBLISHED", reservationsEnabled: true },
    });
    await reserveWish("e2e-owner", "e2e-private-list", "e2e-wish");
    await prisma.premiumGrant.update({
      where: { id: ownerGrant.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expect(gate("e2e-owner")).rejects.toThrow("Active Premium");
    expect(await readWishlist("e2e-private-list", "e2e-owner")).not.toBeNull();
    expect(await readWishlist("e2e-private-list", null)).toBeNull();
    expect(await prisma.reservation.count({ where: { endedAt: null } })).toBe(
      1,
    );
    await prisma.membership.update({
      where: {
        wishlistId_userId: {
          wishlistId: "e2e-private-list",
          userId: "e2e-owner",
        },
      },
      data: { role: "MEMBER" },
    });
    await grant("e2e-member", -dayMs, dayMs);
    await expect(gate("e2e-owner")).rejects.toThrow();
  });

  it("deletes grants with an account without refunding promo uses, and uses the successor's plan", async () => {
    const account = await login("member");
    const promo = await issue(1);
    await redeemPromo(account.user.id, account.session.id, promo.code);
    await prisma.membership.create({
      data: {
        userId: "e2e-owner",
        wishlistId: "e2e-private-list",
        role: "ADMIN",
      },
    });
    await gate("e2e-owner");
    await deleteAccount(account.user.id, account.session.id, {
      password: accounts.member.password,
      confirmation: "DELETE",
      impactToken: (await readDeletionImpact(account.user.id)).impactToken,
    });
    expect(await prisma.premiumGrant.count()).toBe(0);
    expect(await prisma.promoRedemption.count()).toBe(0);
    expect(
      await prisma.promoCode.findUnique({ where: { id: promo.id } }),
    ).toMatchObject({ redemptionCount: 1 });
    expect(await readWishlist("e2e-private-list", "e2e-owner")).not.toBeNull();
    await expect(gate("e2e-owner")).rejects.toThrow("Active Premium");
    const successor = await login();
    await expect(
      redeemPromo(successor.user.id, successor.session.id, promo.code),
    ).rejects.toThrow("unavailable");
  });

  it("supports controlled CLI issuance, listing and revocation without redisplaying secrets", async () => {
    const run = (args: string[]) =>
      promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "scripts/promo.ts", ...args],
        { env: process.env },
      );
    expect((await run(["--help"])).stdout).toContain("create");
    await expect(run(["create", "--days", "0"])).rejects.toThrow();
    const { stdout } = await run([
      "create",
      "--label",
      "e2e-cli",
      "--days",
      "7",
      "--uses",
      "1",
      "--valid-for-days",
      "2",
    ]);
    const promo = JSON.parse(stdout) as { id: string; code: string };
    const listed = (await run(["list"])).stdout;
    expect(listed).toContain(promo.id);
    expect(listed).not.toContain(promo.code);
    expect(listed).not.toContain("codeHash");
    const account = await login();
    await redeemPromo(account.user.id, account.session.id, promo.code);
    await run(["revoke", "--id", promo.id]);
    expect((await readPremiumAccess(account.user.id)).plan).toBe("PREMIUM");
    expect(
      await prisma.promoCode.findUnique({ where: { id: promo.id } }),
    ).toMatchObject({ revokedAt: expect.any(Date) });

    const customArgs = [
      "create",
      "--label",
      "e2e-public-cli",
      "--code",
      "wishlist-30",
      "--days",
      "30",
      "--uses",
      "1000",
      "--valid-for-days",
      "365",
    ];
    const custom = JSON.parse((await run(customArgs)).stdout);
    expect(custom).toMatchObject({
      code: "WISHLIST30",
      durationDays: 30,
      maxRedemptions: 1000,
    });
    expect(new Date(custom.expiresAt).getTime() - Date.now()).toBeCloseTo(
      365 * dayMs,
      -4,
    );
    await expect(run(customArgs)).rejects.toThrow();
  });
});
