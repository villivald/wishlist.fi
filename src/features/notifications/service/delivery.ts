import { premiumGrantEnvironmentWhere } from "@/features/premium/service/entitlements";
import { isGroupEmailCurrent } from "@/features/reservation/service/group-emails";
import { isWishReservedEmailCurrent } from "@/features/reservation/service/owner-emails";
import { isInvitationAcceptanceEmailCurrent } from "@/features/sharing/service/acceptance-email";
import { deliverRenderedEmail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { generateRandomToken } from "@/utils/crypto";

const pendingEmail = () => ({
  sentAt: null,
  canceledAt: null,
  deliveryFailedAt: null,
  nextAttemptAt: { lte: new Date() },
});

export const deliverAccountEmails = async (id?: string) => {
  const pending = await prisma.accountEmail.findMany({
    where: { id, ...pendingEmail() },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 20,
    select: { id: true },
  });
  let sent = 0;
  let failed = 0;
  let canceled = 0;
  for (const item of pending) {
    const claimId = generateRandomToken();
    const claimed = await prisma.accountEmail.updateMany({
      where: { id: item.id, ...pendingEmail() },
      data: { claimId, nextAttemptAt: new Date(Date.now() + 120000) },
    });
    if (!claimed.count) continue;
    const email = await prisma.accountEmail.findUnique({
      where: { id: item.id },
      include: { user: { select: { email: true, emailVerified: true } } },
    });
    if (!email) continue;
    const claimedWhere = { id: item.id, claimId };
    const eligibleGrant =
      !email.grantId ||
      (await prisma.premiumGrant.count({
        where: {
          ...premiumGrantEnvironmentWhere(),
          id: email.grantId,
          userId: email.userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }));
    if (
      !email.user.emailVerified ||
      email.user.email !== email.recipient ||
      !eligibleGrant ||
      !(await isGroupEmailCurrent(email)) ||
      !(await isWishReservedEmailCurrent(email)) ||
      !(await isInvitationAcceptanceEmailCurrent(email))
    ) {
      await prisma.accountEmail.updateMany({
        where: claimedWhere,
        data: { canceledAt: new Date(), claimId: null, html: "", text: "" },
      });
      canceled++;
      continue;
    }
    // Resend retains idempotency keys for 24 hours. Stop ambiguous deliveries
    // before that boundary; never automatically start a new provider request.
    if (
      email.deliveryAttempts >= 8 ||
      (email.firstAttemptAt &&
        Date.now() - email.firstAttemptAt.getTime() >= 23 * 3600000)
    ) {
      await prisma.accountEmail.updateMany({
        where: claimedWhere,
        data: { deliveryFailedAt: new Date(), claimId: null },
      });
      failed++;
      continue;
    }
    const attempt = email.deliveryAttempts + 1;
    const ready = await prisma.accountEmail.updateMany({
      where: {
        ...claimedWhere,
        sentAt: null,
        canceledAt: null,
        nextAttemptAt: { gt: new Date() },
      },
      data: {
        firstAttemptAt: email.firstAttemptAt ?? new Date(),
        deliveryAttempts: { increment: 1 },
      },
    });
    if (!ready.count) continue;
    try {
      await deliverRenderedEmail(
        {
          to: email.recipient,
          from: email.sender,
          subject: email.subject,
          html: email.html,
          text: email.text,
        },
        `wishlist-account-email/${email.id}`,
      );
      await prisma.accountEmail.updateMany({
        where: claimedWhere,
        data: { sentAt: new Date(), claimId: null, html: "", text: "" },
      });
      sent++;
    } catch {
      await prisma.accountEmail.updateMany({
        where: claimedWhere,
        data: {
          claimId: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(60, 2 ** attempt) * 60000,
          ),
          ...(attempt >= 8 ? { deliveryFailedAt: new Date() } : {}),
        },
      });
      failed++;
    }
  }
  return { sent, failed, canceled };
};
