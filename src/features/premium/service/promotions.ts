import {
  AuthError,
  consumeRateLimit,
  lockUser,
} from "@/features/auth/service/security";
import { queueAccountEmail } from "@/features/notifications/service/queue";
import { Prisma } from "@/generated/prisma/client";
import {
  backgroundEvents,
  publishBackgroundEvents,
} from "@/lib/background-events";
import { prisma } from "@/lib/prisma";
import { generateRandomToken, hashToken } from "@/utils/crypto";
import { PremiumError, readPremiumAccess } from "./entitlements";
import { promoInputSchema, promoIssueSchema } from "./schemas";

const dayMs = 24 * 60 * 60 * 1000;
const unavailable =
  "This promo code is unavailable. Check the code or contact the person who gave it to you.";

const hashPromo = (normalized: string) => hashToken(`promo:${normalized}`);

const generatePromoCode = () => {
  const random = generateRandomToken().toUpperCase();
  return `WL-${random.match(/.{8}/g)!.join("-")}`;
};

// Privileged server/CLI operation; never exposed as a server action or public API.
export const issuePromo = async (input: unknown) => {
  const data = promoIssueSchema.parse(input);
  const code = data.code ?? generatePromoCode();
  const promo = await prisma.promoCode.create({
    data: {
      label: data.label,
      codeHash: hashPromo(promoInputSchema.parse(code)),
      durationDays: data.durationDays,
      maxRedemptions: data.maxRedemptions,
      expiresAt: new Date(Date.now() + data.validForDays * dayMs),
    },
    select: {
      id: true,
      label: true,
      durationDays: true,
      maxRedemptions: true,
      expiresAt: true,
    },
  });

  return { ...promo, code };
};

export const revokePromo = async (id: string) => {
  // Revoking stops new redemptions; already granted access is honored.
  await prisma.promoCode.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: { id: true },
  });
};

export const listPromos = async (page: number) =>
  prisma.promoCode.findMany({
    select: {
      id: true,
      label: true,
      durationDays: true,
      maxRedemptions: true,
      redemptionCount: true,
      expiresAt: true,
      revokedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * 20,
    take: 20,
  });

const lockPromo = async (tx: Prisma.TransactionClient, codeHash: string) => {
  const schema =
    new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("Invalid database schema");
  }
  const table = Prisma.raw(`"${schema}"."PromoCode"`);
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM ${table} WHERE "codeHash" = ${codeHash} FOR UPDATE`,
  );
};

export const redeemPromo = async (
  userId: string,
  sessionId: string,
  input: unknown,
) => {
  await consumeRateLimit("promo-redeem", userId, 5, 15 * 60 * 1000);
  const parsed = promoInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new PremiumError(unavailable);
  }
  const codeHash = hashPromo(parsed.data);
  let emailId: string | undefined;
  const result = await prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        emailVerified: true,
        sessions: { some: { id: sessionId, expiresAt: { gt: new Date() } } },
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        locale: true,
      },
    });
    if (!user) {
      throw new AuthError("Your session expired. Please sign in again.");
    }

    await lockPromo(tx, codeHash);
    const now = new Date();
    const promo = await tx.promoCode.findUnique({
      where: { codeHash },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        durationDays: true,
        maxRedemptions: true,
        redemptionCount: true,
      },
    });
    if (
      !promo ||
      promo.revokedAt ||
      promo.expiresAt <= now ||
      promo.redemptionCount >= promo.maxRedemptions
    ) {
      throw new PremiumError(unavailable);
    }
    const previous = await tx.promoRedemption.findUnique({
      where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
      select: { id: true },
    });
    if (previous) {
      throw new PremiumError("You have already redeemed this promo code.");
    }

    const access = await readPremiumAccess(userId, tx);
    const startsAt = access.expiresAt ?? now;
    const expiresAt = new Date(startsAt.getTime() + promo.durationDays * dayMs);

    await tx.promoCode.update({
      where: { id: promo.id },
      data: { redemptionCount: { increment: 1 } },
      select: { id: true },
    });
    const redemption = await tx.promoRedemption.create({
      data: {
        userId,
        promoCodeId: promo.id,
        grant: { create: { userId, startsAt, expiresAt } },
      },
      select: { id: true, grant: { select: { id: true } } },
    });
    emailId = await queueAccountEmail(tx, user, {
      key: `premium-promo/${redemption.id}`,
      premium: {
        source: "promo",
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        grantId: redemption.grant!.id,
      },
    });

    return { expiresAt };
  });
  await publishBackgroundEvents(backgroundEvents.accountEmail, [emailId]);
  return result;
};
