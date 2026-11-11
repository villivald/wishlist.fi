import sharp from "sharp";
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
  readProfile,
  updateProfile,
} from "@/features/account/service/account";
import { authenticate, changePassword } from "@/features/auth/service/accounts";
import { generateEmailVerificationCode } from "@/features/auth/utils/generate-email-verification-code";
import { discoverLists } from "@/features/discovery/service/discovery";
import { cleanupMedia } from "@/features/media/service/cleanup";
import { readableImage, replaceImage } from "@/features/media/service/media";
import { mediaStorage } from "@/features/media/service/storage";
import { generatePasswordResetLink } from "@/features/password/utils/generate-password-reset-link";
import { reserveWish } from "@/features/reservation/service/reservations";
import { createWish, readWish } from "@/features/wish/service/wishes";
import {
  createWishlist,
  readWishlist,
} from "@/features/wishlist/service/lists";
import { validateSession } from "@/lib/lucia";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

assertTestDatabase(process.env);
beforeEach(resetFixtures);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await resetFixtures();
  await cleanupMedia();
  await prisma.$disconnect();
});

const login = (role: keyof typeof accounts = "owner") =>
  authenticate(accounts[role].email, accounts[role].password);
const deletionInput = async (userId = "e2e-owner") => ({
  password: accounts.owner.password,
  confirmation: "DELETE",
  impactToken: (await readDeletionImpact(userId)).impactToken,
});
const createList = (id: string, ownerId = "e2e-owner") =>
  prisma.wishlist.create({
    data: {
      id,
      title: id,
      ownerId,
      publication: "PUBLISHED",
      reservationsEnabled: true,
      memberships: { create: { userId: ownerId, role: "ADMIN" } },
      wishes: {
        create: { id: `${id}-wish`, title: "Retained gift", authorId: ownerId },
      },
    },
  });

describe("profile and account deletion", () => {
  it("does not reveal previously archived content in the deletion summary", async () => {
    const account = await login();
    const archived = await prisma.wishlist.findUniqueOrThrow({
      where: { id: "e2e-archived-list" },
    });
    const impact = await readDeletionImpact(account.user.id);
    expect(impact.listCount).toBe(0);
    expect(JSON.stringify(impact)).not.toContain(archived.title);
    await deleteAccount(
      account.user.id,
      account.session.id,
      await deletionInput(),
    );
    expect(
      await prisma.wishlist.findUnique({ where: { id: archived.id } }),
    ).toMatchObject({ ownerId: null, archivedAt: archived.archivedAt });
  });
  it("an upload finishing after deletion cannot attach an avatar and its file remains eligible for cleanup", async () => {
    const account = await login();
    const uploaded = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const put = mediaStorage.put;
    vi.spyOn(mediaStorage, "put").mockImplementationOnce(async (...args) => {
      await put(...args);
      uploaded.resolve();
      await release.promise;
    });
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    const upload = replaceImage(
      account.user.id,
      { kind: "avatar" },
      "Late avatar",
      bytes,
    );
    await uploaded.promise;
    try {
      await deleteAccount(
        account.user.id,
        account.session.id,
        await deletionInput(),
      );
    } finally {
      release.resolve();
    }
    await expect(upload).rejects.toThrow("account is unavailable");
    const pending = await prisma.media.findFirstOrThrow({
      where: { alt: "Late avatar", userId: null },
    });
    expect(await readableImage(pending.id, account.user.id)).toBeNull();
    await prisma.media.update({
      where: { id: pending.id },
      data: { cleanupAfter: new Date(0) },
    });
    await cleanupMedia();
    expect(
      await prisma.media.findUnique({ where: { id: pending.id } }),
    ).toBeNull();
  });

  it("concurrent owner and successor deletion require a fresh summary for any changed ownership", async () => {
    const owner = await login();
    const member = await login("member");
    const list = await createList("e2e-delete-both");
    await prisma.membership.create({
      data: { userId: member.user.id, wishlistId: list.id, role: "ADMIN" },
    });
    const input = await deletionInput(owner.user.id);
    const memberInput = await deletionInput(member.user.id);
    const results = await Promise.allSettled([
      deleteAccount(owner.user.id, owner.session.id, input),
      deleteAccount(member.user.id, member.session.id, memberInput),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason.message).toContain("review the updated summary");
      }
    }
    for (const account of [owner, member]) {
      if (await prisma.user.findUnique({ where: { id: account.user.id } })) {
        await deleteAccount(
          account.user.id,
          account.session.id,
          await deletionInput(account.user.id),
        );
      }
    }
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({ ownerId: null, archivedAt: expect.any(Date) });
  });
  it("edits only the current profile, trims optional text, and preserves identity and credentials", async () => {
    const account = await login();
    await updateProfile(account.user.id, account.session.id, {
      name: "  Ada Lovelace  ",
      description: "  Books & gardens  ",
      id: "e2e-member",
      emailVerified: false,
      email: "spoof@example.test",
      passwordHash: "spoof",
    });
    expect(await readProfile(account.user.id)).toEqual({
      showPremiumBadge: false,
      name: "Ada Lovelace",
      description: "Books & gardens",
    });
    expect(
      await prisma.user.findUnique({ where: { id: account.user.id } }),
    ).toMatchObject({
      email: accounts.owner.email,
      emailVerified: true,
      passwordHash: account.user.passwordHash,
    });
    expect(await readProfile("e2e-member")).toEqual({
      showPremiumBadge: false,
      name: null,
      description: null,
    });
    await updateProfile(account.user.id, account.session.id, {
      name: "  ",
      description: "",
    });
    expect(await readProfile(account.user.id)).toEqual({
      showPremiumBadge: false,
      name: null,
      description: null,
    });
    await expect(
      updateProfile(account.user.id, account.session.id, {
        name: "x".repeat(81),
        description: "",
      }),
    ).rejects.toThrow();
  });

  it("requires the current verified account's live session for profile changes and deletion", async () => {
    const account = await login();
    const member = await login("member");
    await expect(
      updateProfile(account.user.id, member.session.id, {
        name: "Spoof",
        description: "",
      }),
    ).rejects.toThrow("session expired");
    await expect(
      deleteAccount(account.user.id, member.session.id, await deletionInput()),
    ).rejects.toThrow("session expired");
    await prisma.session.update({
      where: { id: account.session.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      deleteAccount(account.user.id, account.session.id, await deletionInput()),
    ).rejects.toThrow("session expired");
    await prisma.user.update({
      where: { id: member.user.id },
      data: { emailVerified: false },
    });
    await expect(
      updateProfile(member.user.id, member.session.id, {
        name: "No",
        description: "",
      }),
    ).rejects.toThrow("session expired");
  });

  it("requires a current password, explicit confirmation and an unchanged impact summary", async () => {
    const account = await login();
    const data = await deletionInput();
    await expect(
      deleteAccount(account.user.id, account.session.id, {
        ...data,
        password: "wrong",
      }),
    ).rejects.toThrow("Incorrect current password");
    await expect(
      deleteAccount(account.user.id, account.session.id, {
        ...data,
        confirmation: "yes",
      }),
    ).rejects.toThrow();
    await expect(
      deleteAccount(account.user.id, account.session.id, {
        ...data,
        impactToken: "0".repeat(64),
      }),
    ).rejects.toThrow("Refresh");
    expect((await validateSession(account.token)).user?.id).toBe(
      account.user.id,
    );
    expect(await prisma.user.count({ where: { id: account.user.id } })).toBe(1);
  });

  it("archives lists without a successor, cancels every affected reservation, revokes credentials and queues avatar cleanup", async () => {
    const account = await login();
    await login();
    const list = await createList("e2e-delete-archive");
    await reserveWish("e2e-member", list.id, `${list.id}-wish`);
    await generatePasswordResetLink(account.user.id);
    await generateEmailVerificationCode(account.user.id, account.user.email);
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const avatar = await replaceImage(
      account.user.id,
      { kind: "avatar" },
      "Personal avatar",
      bytes,
    );
    const image = await replaceImage(
      account.user.id,
      { kind: "list", listId: list.id },
      "List cover",
      bytes,
    );
    await deleteAccount(
      account.user.id,
      account.session.id,
      await deletionInput(),
    );
    expect(
      await prisma.user.findUnique({ where: { id: account.user.id } }),
    ).toBeNull();
    for (const count of [
      await prisma.session.count({ where: { userId: account.user.id } }),
      await prisma.membership.count({ where: { userId: account.user.id } }),
      await prisma.passwordResetToken.count({
        where: { userId: account.user.id },
      }),
      await prisma.emailVerificationToken.count({
        where: { userId: account.user.id },
      }),
      await prisma.reservation.count({
        where: { wishId: `${list.id}-wish`, endedAt: null },
      }),
    ]) {
      expect(count).toBe(0);
    }
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({ ownerId: null, archivedAt: expect.any(Date) });
    expect(
      await prisma.wish.findUnique({ where: { id: `${list.id}-wish` } }),
    ).toMatchObject({ title: "Retained gift", authorId: null });
    expect(await readWishlist(list.id, "e2e-member")).toBeNull();
    expect(await readWish(list.id, `${list.id}-wish`, "e2e-member")).toBeNull();
    expect((await discoverLists({})).lists).toEqual([]);
    expect(await readableImage(avatar.id, account.user.id)).toBeNull();
    expect(await readableImage(image.id, "e2e-member")).toBeNull();
    expect(
      await prisma.media.findUnique({ where: { id: image.id } }),
    ).not.toBeNull();
    await cleanupMedia();
    expect(
      await prisma.media.findUnique({ where: { id: avatar.id } }),
    ).toBeNull();
    expect((await validateSession(account.token)).user).toBeNull();
  });

  it("transfers private lists by membership date then ID, preserving content, settings and other people's reservations", async () => {
    const account = await login();
    await prisma.user.createMany({
      data: ["e2e-admin-a", "e2e-admin-b"].map((id) => ({
        id,
        username: id,
        email: `${id}@example.test`,
        emailVerified: true,
        passwordHash: account.user.passwordHash,
      })),
    });
    const list = await createList("e2e-delete-transfer");
    await prisma.membership.createMany({
      data: [
        {
          id: "e2e-membership-a",
          userId: "e2e-admin-a",
          wishlistId: list.id,
          role: "ADMIN",
          joinedAt: new Date("2025-01-01"),
        },
        {
          id: "e2e-membership-b",
          userId: "e2e-admin-b",
          wishlistId: list.id,
          role: "ADMIN",
          joinedAt: new Date("2025-01-01"),
        },
        {
          id: "e2e-membership-0",
          userId: "e2e-member",
          wishlistId: list.id,
          role: "ADMIN",
          joinedAt: new Date("2025-02-01"),
        },
      ],
    });
    await prisma.wishlist.update({
      where: { id: list.id },
      data: { visibility: "PRIVATE" },
    });
    await reserveWish("e2e-member", list.id, `${list.id}-wish`);
    expect(
      (await readDeletionImpact(account.user.id)).lists.find(
        ({ id }) => id === list.id,
      )?.successor,
    ).toBe("e2e-admin-a");
    await deleteAccount(
      account.user.id,
      account.session.id,
      await deletionInput(),
    );
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({
      ownerId: "e2e-admin-a",
      archivedAt: null,
      visibility: "PRIVATE",
      publication: "PUBLISHED",
      reservationsEnabled: true,
    });
    expect(
      await prisma.reservation.count({
        where: { wishId: `${list.id}-wish`, endedAt: null },
      }),
    ).toBe(1);
    expect(
      await readWish(list.id, `${list.id}-wish`, "e2e-member"),
    ).not.toBeNull();
    expect(await readWish(list.id, `${list.id}-wish`, null)).toBeNull();
  });

  it.each([true, false])(
    "skips unverified successor admins when a verified alternative exists: %s",
    async (verifiedAlternative) => {
      const account = await login();
      await prisma.user.create({
        data: {
          id: "e2e-unverified-admin",
          username: "unverified-admin",
          email: "unverified-admin@example.test",
          passwordHash: account.user.passwordHash,
          emailVerified: false,
        },
      });
      const list = await createList("e2e-delete-unverified-successor");
      await prisma.membership.createMany({
        data: [
          {
            userId: "e2e-unverified-admin",
            wishlistId: list.id,
            role: "ADMIN",
            joinedAt: new Date("2024-01-01"),
          },
          ...(verifiedAlternative
            ? [
                {
                  userId: "e2e-member",
                  wishlistId: list.id,
                  role: "ADMIN" as const,
                  joinedAt: new Date("2025-01-01"),
                },
              ]
            : []),
        ],
      });
      const impact = await readDeletionImpact(account.user.id);
      expect(impact.lists.find(({ id }) => id === list.id)?.successor).toBe(
        verifiedAlternative ? "e2e-member" : null,
      );
      await deleteAccount(account.user.id, account.session.id, {
        password: accounts.owner.password,
        confirmation: "DELETE",
        impactToken: impact.impactToken,
      });
      expect(
        await prisma.wishlist.findUnique({ where: { id: list.id } }),
      ).toMatchObject({
        ownerId: verifiedAlternative ? "e2e-member" : null,
        archivedAt: verifiedAlternative ? null : expect.any(Date),
      });
    },
  );

  it("requires a fresh deletion summary when the successor is no longer verified", async () => {
    const account = await login();
    const list = await createList("e2e-delete-successor-verification");
    await prisma.membership.create({
      data: { userId: "e2e-member", wishlistId: list.id, role: "ADMIN" },
    });
    const input = await deletionInput();
    await prisma.user.update({
      where: { id: "e2e-member" },
      data: { emailVerified: false },
    });
    await expect(
      deleteAccount(account.user.id, account.session.id, input),
    ).rejects.toThrow("review the updated summary");
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({
      ownerId: account.user.id,
      archivedAt: null,
    });
    expect((await validateSession(account.token)).user?.id).toBe(
      account.user.id,
    );
  });

  it("cancels the deleted user's reservations and retains authored wishes on other people's lists", async () => {
    const account = await login();
    const list = await createList("e2e-delete-member-list", "e2e-member");
    await prisma.wish.update({
      where: { id: `${list.id}-wish` },
      data: { authorId: account.user.id },
    });
    await reserveWish(account.user.id, list.id, `${list.id}-wish`);
    expect((await readDeletionImpact(account.user.id)).reservationCount).toBe(
      1,
    );
    await deleteAccount(
      account.user.id,
      account.session.id,
      await deletionInput(),
    );
    expect(
      await prisma.reservation.count({ where: { userId: account.user.id } }),
    ).toBe(0);
    expect(await readWish(list.id, `${list.id}-wish`, null)).toMatchObject({
      title: "Retained gift",
      isReserved: false,
    });
    expect(
      await prisma.wish.findUnique({ where: { id: `${list.id}-wish` } }),
    ).toMatchObject({ authorId: null });
  });

  it("rejects a stale summary when a successor changes without partly deleting anything", async () => {
    const account = await login();
    const list = await createList("e2e-delete-stale");
    const input = await deletionInput();
    await prisma.membership.create({
      data: { userId: "e2e-member", wishlistId: list.id, role: "ADMIN" },
    });
    await expect(
      deleteAccount(account.user.id, account.session.id, input),
    ).rejects.toThrow("review the updated summary");
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({ ownerId: account.user.id, archivedAt: null });
    expect((await validateSession(account.token)).user?.id).toBe(
      account.user.id,
    );
  });

  it("rejects a deletion form from a session revoked by a password change", async () => {
    const account = await login();
    const input = await deletionInput();
    await changePassword(
      account.user.id,
      accounts.owner.password,
      "Changed-password-123!",
    );
    await expect(
      deleteAccount(account.user.id, account.session.id, input),
    ).rejects.toThrow("session expired");
    expect(await prisma.user.count({ where: { id: account.user.id } })).toBe(1);
  });

  it("limits password attempts using the shared database counter", async () => {
    const account = await login();
    const input = { ...(await deletionInput()), password: "wrong" };
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        deleteAccount(account.user.id, account.session.id, input),
      ).rejects.toThrow("Incorrect current password");
    }
    await expect(
      deleteAccount(account.user.id, account.session.id, await deletionInput()),
    ).rejects.toThrow("Too many attempts");
  });

  it("serializes repeated deletion and leaves no owned lists or sessions", async () => {
    const account = await login();
    await createList("e2e-delete-concurrent");
    const input = await deletionInput();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        deleteAccount(account.user.id, account.session.id, input),
      ),
    );
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.wishlist.count({ where: { ownerId: account.user.id } }),
    ).toBe(0);
    expect(
      await prisma.session.count({ where: { userId: account.user.id } }),
    ).toBe(0);
  });

  it("coordinates deletion with a successor reserving, without a foreign-key deadlock", async () => {
    const account = await login();
    const list = await createList("e2e-delete-reservation-race");
    await prisma.membership.create({
      data: { userId: "e2e-member", wishlistId: list.id, role: "ADMIN" },
    });
    const input = await deletionInput();
    await Promise.all([
      deleteAccount(account.user.id, account.session.id, input),
      reserveWish("e2e-member", list.id, `${list.id}-wish`),
    ]);
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({ ownerId: "e2e-member", archivedAt: null });
    expect(
      await prisma.reservation.count({
        where: { wishId: `${list.id}-wish`, endedAt: null },
      }),
    ).toBe(1);
  });

  it("serializes new content with deletion and prevents orphaned active lists", async () => {
    const account = await login();
    const list = await createList("e2e-delete-create-race");
    const input = await deletionInput();
    const results = await Promise.allSettled([
      deleteAccount(account.user.id, account.session.id, input),
      createWishlist(account.user.id, { title: "Concurrent list" }),
      createWish(account.user.id, list.id, { title: "Concurrent wish" }),
    ]);
    const user = await prisma.user.findUnique({
      where: { id: account.user.id },
    });
    if (!user) {
      expect(
        await prisma.wishlist.count({ where: { ownerId: account.user.id } }),
      ).toBe(0);
      expect(
        await prisma.wish.count({ where: { authorId: account.user.id } }),
      ).toBe(0);
    } else {
      expect(results[0].status).toBe("rejected");
      await deleteAccount(
        account.user.id,
        account.session.id,
        await deletionInput(),
      );
    }
    // This test creates a service-generated ID which resetFixtures cannot find after archival.
    await prisma.wishlist.deleteMany({
      where: { title: "Concurrent list", ownerId: null },
    });
  });
});
