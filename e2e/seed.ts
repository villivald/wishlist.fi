import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/features/password/utils/hash-and-verify";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertTestDatabase, testDatabaseUrl } from "./environment";

export const accounts = {
  owner: { email: "owner@example.test", password: "Fixture-only-password!" },
  member: { email: "member@example.test", password: "Fixture-only-password!" },
};

export const newAccount = {
  username: "e2e-new-user",
  email: "new-user@example.test",
  password: "New-account-password!",
};

export const testPrisma = () => {
  assertTestDatabase(process.env);
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: testDatabaseUrl },
      { schema: "wishlist" },
    ),
  });
};

export const resetFixtures = async () => {
  const prisma = testPrisma();
  try {
    const passwordHash = await hashPassword(accounts.owner.password);
    await prisma.$transaction(async (tx) => {
      await tx.wishlist.deleteMany({
        where: {
          OR: [
            { id: { startsWith: "e2e-" } },
            {
              ownerId: {
                in: Object.keys(accounts).map((role) => `e2e-${role}`),
              },
            },
            {
              owner: {
                OR: [
                  { email: newAccount.email },
                  { username: newAccount.username },
                  { email: { startsWith: "e2e-google-" } },
                ],
              },
            },
          ],
        },
      });
      await tx.billingAccount.deleteMany({
        where: { OR: [{ userId: { startsWith: "e2e-" } }, { userId: null }] },
      });
      await tx.billingEvent.deleteMany();
      await tx.user.deleteMany({
        where: {
          OR: [
            { id: { startsWith: "e2e-" } },
            { email: newAccount.email },
            { username: newAccount.username },
            { email: { startsWith: "e2e-google-" } },
          ],
        },
      });
      await tx.promoCode.deleteMany({
        where: { label: { startsWith: "e2e-" } },
      });
      await tx.authRateLimit.deleteMany();
      await tx.user.createMany({
        data: Object.entries(accounts).map(([role, account]) => ({
          id: `e2e-${role}`,
          username: `e2e-${role}`,
          email: account.email,
          emailVerified: true,
          passwordHash,
        })),
      });
      await tx.wishlist.create({
        data: {
          id: "e2e-private-list",
          title: "Another person's private list",
          ownerId: "e2e-member",
          visibility: "PRIVATE",
          memberships: { create: { userId: "e2e-member", role: "ADMIN" } },
          wishes: {
            create: {
              id: "e2e-wish",
              title: "Private wish",
              authorId: "e2e-member",
            },
          },
        },
      });
      await tx.wishlist.create({
        data: {
          id: "e2e-archived-list",
          title: "Archived list",
          ownerId: "e2e-owner",
          archivedAt: new Date(),
        },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
};
