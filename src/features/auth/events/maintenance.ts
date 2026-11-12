import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/prisma";

export const authMaintenance = inngest.createFunction(
  { id: "expire-auth-data", triggers: [{ cron: "0 3 * * *" }] },
  async () => {
    const expiresAt = { lt: new Date() };

    await prisma.$transaction([
      prisma.authRateLimit.deleteMany({ where: { expiresAt } }),
      prisma.session.deleteMany({ where: { expiresAt } }),
      prisma.emailVerificationToken.deleteMany({ where: { expiresAt } }),
      prisma.passwordResetToken.deleteMany({ where: { expiresAt } }),
      prisma.googleAuthRequest.deleteMany({ where: { expiresAt } }),
    ]);
    return { cleaned: true };
  },
);
