import { cache } from "react";
import { billingEnvironment } from "@/features/billing/service/config";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { continuousPremiumUntil } from "./period";

export class PremiumError extends Error {}

// Use the same environment boundary for access, public badges and queued guides.
// Promo/manual grants remain eligible even when billing is not configured.
export const premiumGrantEnvironmentWhere =
  (): Prisma.PremiumGrantWhereInput => {
    const environment = billingEnvironment();
    return {
      OR: [
        { billingPaymentId: null },
        ...(environment
          ? [{ billingPayment: { subscription: { account: { environment } } } }]
          : []),
      ],
    };
  };

const queryPremiumAccess = async (
  userId: string,
  db: Prisma.TransactionClient,
) => {
  const now = new Date();
  const periods = await db.premiumGrant.findMany({
    where: {
      ...premiumGrantEnvironmentWhere(),
      userId,
      user: { emailVerified: true },
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { startsAt: true, expiresAt: true },
    orderBy: { startsAt: "asc" },
  });
  const expiresAt = continuousPremiumUntil(periods, now);

  return {
    plan: expiresAt ? ("PREMIUM" as const) : ("FREE" as const),
    expiresAt,
    nextStartsAt: expiresAt
      ? null
      : (periods.find((period) => period.startsAt > now)?.startsAt ?? null),
  };
};

const readCachedPremiumAccess = cache((userId: string) =>
  queryPremiumAccess(userId, prisma),
);

export const readPremiumAccess = (
  userId: string,
  db: Prisma.TransactionClient = prisma,
) =>
  db === prisma
    ? readCachedPremiumAccess(userId)
    : queryPremiumAccess(userId, db);

export const requirePremium = async (
  userId: string,
  db: Prisma.TransactionClient = prisma,
) => {
  const access = await readPremiumAccess(userId, db);

  if (access.plan !== "PREMIUM") {
    throw new PremiumError(
      "Active Premium access is required for this action.",
    );
  }
  return access;
};
