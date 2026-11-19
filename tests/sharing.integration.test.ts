import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  deleteAccount,
  readDeletionImpact,
} from "@/features/account/service/account";
import { authenticate } from "@/features/auth/service/accounts";
import { readGuestList } from "@/features/guest/service/access";
import { createGuestLink } from "@/features/guest/service/links";
import { reserveWish } from "@/features/reservation/service/reservations";
import {
  acceptInvitation,
  inviteMember,
  readInvitation,
  revokeInvitation,
} from "@/features/sharing/service/invitations";
import { setListAccess } from "@/features/sharing/service/list-access";
import {
  changeMemberRole,
  removeMember,
  setVisibility,
  transferOwnership,
} from "@/features/sharing/service/members";
import { readSharing } from "@/features/sharing/service/queries";
import {
  createWishlist,
  readMyWishlists,
  readWishlist,
  updateWishlist,
} from "@/features/wishlist/service/lists";
import { ReservationReviewRequired } from "@/features/wishlist/service/reservation-review";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

assertTestDatabase(process.env);
const listId = "e2e-sharing";
let owner: Awaited<ReturnType<typeof authenticate>>;
let member: Awaited<ReturnType<typeof authenticate>>;

const premium = (userId: string) =>
  prisma.premiumGrant.create({
    data: {
      userId,
      startsAt: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
const invite = (role = "MEMBER", email = accounts.member.email) =>
  inviteMember(owner.user.id, owner.session.id, listId, { email, role });
const join = (id: string) =>
  acceptInvitation(member.user.id, member.session.id, id);
const membership = () =>
  prisma.membership.findUniqueOrThrow({
    where: {
      wishlistId_userId: { wishlistId: listId, userId: member.user.id },
    },
  });
const expirePremium = () =>
  prisma.premiumGrant.updateMany({
    data: { expiresAt: new Date(Date.now() - 1) },
  });

beforeEach(async () => {
  await resetFixtures();
  owner = await authenticate(accounts.owner.email, accounts.owner.password);
  member = await authenticate(accounts.member.email, accounts.member.password);
  await premium(owner.user.id);
  await prisma.wishlist.create({
    data: {
      id: listId,
      title: "Secret collaboration title",
      ownerId: owner.user.id,
      visibility: "PRIVATE",
      publication: "PUBLISHED",
      reservationsEnabled: true,
      memberships: { create: { userId: owner.user.id, role: "ADMIN" } },
      wishes: {
        create: [
          {
            id: "e2e-sharing-wish",
            title: "Secret gift",
            authorId: owner.user.id,
          },
        ],
      },
    },
  });
});
afterAll(async () => {
  await resetFixtures();
  await prisma.$disconnect();
});

describe("private lists and collaboration", () => {
  it("suggests only the viewer's previously accepted invitees and excludes current members and pending invitations", async () => {
    const previous = await createWishlist(owner.user.id, {
      title: "Previous family list",
      description: "",
      reservationsEnabled: false,
      visibility: "PRIVATE",
    });
    const invitation = await inviteMember(
      owner.user.id,
      owner.session.id,
      previous.id,
      { email: member.user.email, role: "MEMBER" },
    );
    await join(invitation.id);
    const recipients = async () =>
      (await readSharing(listId, owner.user.id))?.previousRecipients;
    expect(await recipients()).toEqual([
      { email: member.user.email, username: member.user.username },
    ]);
    expect(await readSharing(listId, member.user.id)).toBeNull();

    await changeMemberRole(
      owner.user.id,
      owner.session.id,
      previous.id,
      (
        await prisma.membership.findUniqueOrThrow({
          where: {
            wishlistId_userId: {
              wishlistId: previous.id,
              userId: member.user.id,
            },
          },
        })
      ).id,
      "ADMIN",
    );
    // A list admin sees their own invitation history, never another admin's contacts.
    expect(
      (await readSharing(previous.id, member.user.id))?.previousRecipients,
    ).toEqual([]);
    const pending = await invite();
    expect(await recipients()).toEqual([]);
    await join(pending.id);
    expect(await recipients()).toEqual([]);
  });

  const favoriteMember = async () => {
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { visibility: "PUBLIC", publication: "PUBLISHED" },
    });
    await prisma.favoritePerson.create({
      data: { userId: owner.user.id, personId: member.user.id },
    });
  };
  const inviteFavorite = () =>
    inviteMember(owner.user.id, owner.session.id, listId, {
      recipientId: member.user.id,
      role: "MEMBER",
    });

  it("recommends favorites without emails, binds invitations to the selected account and keeps delivery addresses private", async () => {
    await favoriteMember();
    const before = await readSharing(listId, owner.user.id);
    expect(before?.favorites).toEqual([
      { id: member.user.id, name: null, username: member.user.username },
    ]);
    expect(JSON.stringify(before)).not.toContain(member.user.email);
    const invitation = await inviteFavorite();
    expect(await inviteFavorite()).toEqual(invitation);
    expect(
      await prisma.invitation.findUnique({ where: invitation }),
    ).toMatchObject({
      recipientId: member.user.id,
      email: member.user.email,
    });
    const pending = await readSharing(listId, owner.user.id);
    expect(pending?.favorites).toEqual([]);
    expect(pending?.invitations[0]).toMatchObject({
      email: null,
      recipient: { id: member.user.id },
    });
    expect(JSON.stringify(pending)).not.toContain(member.user.email);
    // Removing a favorite must not expose the delivery address on a later visit.
    await prisma.favoritePerson.deleteMany({
      where: { userId: owner.user.id },
    });
    expect(
      JSON.stringify(await readSharing(listId, owner.user.id)),
    ).not.toContain(member.user.email);
    expect(await readInvitation(invitation.id, owner.user.id)).toBeNull();
    expect(await readInvitation(invitation.id, member.user.id)).not.toBeNull();
    await join(invitation.id);
    expect((await membership()).role).toBe("MEMBER");
    const other = await createWishlist(owner.user.id, {
      title: "Another list",
      description: "",
      reservationsEnabled: false,
      visibility: "PRIVATE",
    });
    expect(
      (await readSharing(other.id, owner.user.id))?.previousRecipients,
    ).toEqual([]);
  });

  it("rejects arbitrary or stale favorite IDs and preserves the Premium gate", async () => {
    await expect(inviteFavorite()).rejects.toThrow(
      "favorite is no longer available",
    );
    await favoriteMember();
    await prisma.user.update({
      where: { id: member.user.id },
      data: { emailVerified: false },
    });
    expect((await readSharing(listId, owner.user.id))?.favorites).toEqual([]);
    await expect(inviteFavorite()).rejects.toThrow(
      "favorite is no longer available",
    );
    await prisma.user.update({
      where: { id: member.user.id },
      data: { emailVerified: true },
    });
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { publication: "DRAFT" },
    });
    await expect(inviteFavorite()).rejects.toThrow(
      "favorite is no longer available",
    );
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { publication: "PUBLISHED" },
    });
    await expirePremium();
    expect((await readSharing(listId, owner.user.id))?.favorites).toEqual([]);
    await expect(inviteFavorite()).rejects.toThrow(/Premium/);
    expect(
      await prisma.invitation.count({ where: { wishlistId: listId } }),
    ).toBe(0);
  });

  it("excludes self, existing members and pending invitations beyond the current page from favorites", async () => {
    await favoriteMember();
    await prisma.favoritePerson.create({
      data: { userId: owner.user.id, personId: owner.user.id },
    });
    expect((await readSharing(listId, owner.user.id))?.favorites).toHaveLength(
      1,
    );
    const invitation = await inviteFavorite();
    await prisma.invitation.createMany({
      data: Array.from({ length: 22 }, (_, index) => ({
        email: `e2e-pending-${index}@example.test`,
        wishlistId: listId,
        inviterId: owner.user.id,
        role: "MEMBER" as const,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(Date.now() + index + 1000),
      })),
    });
    const firstPage = await readSharing(listId, owner.user.id);
    expect(firstPage?.invitations.some(({ id }) => id === invitation.id)).toBe(
      false,
    );
    expect(firstPage?.favorites).toEqual([]);
    await join(invitation.id);
    expect((await readSharing(listId, owner.user.id))?.favorites).toEqual([]);
  });

  it("does not let a reused email accept an invitation intended for a different account", async () => {
    await favoriteMember();
    const invitation = await inviteFavorite();
    await prisma.user.update({
      where: { id: member.user.id },
      data: { email: "e2e-changed@example.test" },
    });
    expect((await readSharing(listId, owner.user.id))?.favorites).toEqual([]);
    await expect(inviteFavorite()).rejects.toThrow(
      "Revoke the pending invitation",
    );
    await prisma.user.update({
      where: { id: owner.user.id },
      data: { email: member.user.email },
    });
    expect(await readInvitation(invitation.id, owner.user.id)).toBeNull();
    await expect(
      acceptInvitation(owner.user.id, owner.session.id, invitation.id),
    ).rejects.toThrow("invitation is unavailable");
    expect(await readInvitation(invitation.id, member.user.id)).toBeNull();
    await deleteAccount(member.user.id, member.session.id, {
      password: accounts.member.password,
      confirmation: "DELETE",
      impactToken: (await readDeletionImpact(member.user.id)).impactToken,
    });
    expect(
      await prisma.invitation.findUnique({ where: invitation }),
    ).toBeNull();
  });

  it("keeps joined-list counts readable while current roles control management", async () => {
    await join((await invite()).id);
    await reserveWish(member.user.id, listId, "e2e-sharing-wish");
    const joinedList = async () =>
      (await readMyWishlists(member.user.id, 1, true)).lists.find(
        ({ id }) => id === listId,
      );
    expect(await joinedList()).toMatchObject({
      availableWishCount: 0,
      reservedWishCount: 1,
      canManage: false,
    });
    const target = await membership();
    await changeMemberRole(
      owner.user.id,
      owner.session.id,
      listId,
      target.id,
      "ADMIN",
    );
    expect(await joinedList()).toMatchObject({
      canManage: true,
      reservedWishCount: 1,
    });
    await changeMemberRole(
      owner.user.id,
      owner.session.id,
      listId,
      target.id,
      "MEMBER",
    );
    expect(await joinedList()).toMatchObject({
      canManage: false,
      reservedWishCount: 1,
    });
  });

  it("requires Premium for new private lists and ignores spoofed ownership", async () => {
    const input = {
      title: "Created private list",
      description: "",
      reservationsEnabled: false,
      visibility: "PRIVATE",
      ownerId: member.user.id,
    };
    const created = await createWishlist(owner.user.id, input);
    expect(
      await prisma.wishlist.findUnique({ where: { id: created.id } }),
    ).toMatchObject({
      ownerId: owner.user.id,
      visibility: "PRIVATE",
      publication: "PUBLISHED",
    });
    await expect(createWishlist(member.user.id, input)).rejects.toThrow(
      "Active Premium",
    );
    await expect(
      createWishlist(owner.user.id, { ...input, visibility: "UNLISTED" }),
    ).rejects.toThrow();
  });

  it("normalizes the intended email, hides content before joining, and creates a free member only on acceptance", async () => {
    const invitation = await invite("MEMBER", " MEMBER@EXAMPLE.TEST ");
    expect(await membership().catch(() => null)).toBeNull();
    expect(await readWishlist(listId, member.user.id)).toBeNull();
    const preview = await readInvitation(invitation.id, member.user.id);
    expect(preview).toMatchObject({ role: "MEMBER", canAccept: true });
    expect(JSON.stringify(preview)).not.toContain("Secret");
    expect(await readInvitation(invitation.id, owner.user.id)).toBeNull();
    await join(invitation.id);
    expect(await membership()).toMatchObject({ role: "MEMBER" });
    expect(await readWishlist(listId, member.user.id)).toMatchObject({
      canManage: false,
    });
    expect(await readSharing(listId, member.user.id)).toBeNull();
    await expect(join(invitation.id)).rejects.toThrow("unavailable");
  });

  it("requires the intended verified account and a live session", async () => {
    const invitation = await invite();
    await expect(
      acceptInvitation(owner.user.id, owner.session.id, invitation.id),
    ).rejects.toThrow("unavailable");
    await expect(
      acceptInvitation(member.user.id, owner.session.id, invitation.id),
    ).rejects.toThrow("session expired");
    await prisma.user.update({
      where: { id: member.user.id },
      data: { emailVerified: false },
    });
    expect(await readInvitation(invitation.id, member.user.id)).toBeNull();
    await expect(join(invitation.id)).rejects.toThrow("session expired");
    await prisma.user.update({
      where: { id: member.user.id },
      data: { emailVerified: true },
    });
    await prisma.session.update({
      where: { id: member.session.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(join(invitation.id)).rejects.toThrow("session expired");
    expect(
      await prisma.membership.count({ where: { wishlistId: listId } }),
    ).toBe(1);
  });

  it.each(["expired", "revoked", "archived", "deleted"])(
    "rejects %s invitations without adding membership",
    async (state) => {
      const invitation = await invite();
      if (state === "expired")
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            createdAt: new Date(Date.now() - 86400000),
            expiresAt: new Date(Date.now() - 1),
          },
        });
      if (state === "revoked")
        await revokeInvitation(
          owner.user.id,
          owner.session.id,
          listId,
          invitation.id,
        );
      if (state === "archived")
        await prisma.wishlist.update({
          where: { id: listId },
          data: { archivedAt: new Date() },
        });
      if (state === "deleted")
        await prisma.wishlist.delete({ where: { id: listId } });
      expect(await readInvitation(invitation.id, member.user.id)).toBeNull();
      await expect(join(invitation.id)).rejects.toThrow();
      expect(
        await prisma.membership.count({
          where: { wishlistId: listId, userId: member.user.id },
        }),
      ).toBe(0);
    },
  );

  it("deduplicates concurrent invitations and acceptance; replacement invalidates an expired invitation", async () => {
    const invitations = await Promise.all([invite(), invite(), invite()]);
    expect(new Set(invitations.map(({ id }) => id)).size).toBe(1);
    const results = await Promise.allSettled([
      join(invitations[0].id),
      join(invitations[0].id),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.membership.count({
        where: { wishlistId: listId, userId: member.user.id },
      }),
    ).toBe(1);
    await removeMember(
      owner.user.id,
      owner.session.id,
      listId,
      (await membership()).id,
    );
    const old = await invite();
    await prisma.invitation.update({
      where: { id: old.id },
      data: {
        createdAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() - 1),
      },
    });
    const replacement = await invite("ADMIN");
    expect(replacement.id).not.toBe(old.id);
    await expect(join(old.id)).rejects.toThrow("unavailable");
    await join(replacement.id);
    expect((await membership()).role).toBe("ADMIN");
  });

  it("rechecks Premium on acceptance and blocks new operations while preserving existing access and maintenance", async () => {
    const invitation = await invite("ADMIN");
    await expirePremium();
    expect(await readInvitation(invitation.id, member.user.id)).toMatchObject({
      canAccept: false,
    });
    await expect(join(invitation.id)).rejects.toThrow("Active Premium");
    await premium(owner.user.id);
    await join(invitation.id);
    await reserveWish(member.user.id, listId, "e2e-sharing-wish");
    await expirePremium();
    await expect(invite("MEMBER", "new@example.test")).rejects.toThrow(
      "Active Premium",
    );
    await updateWishlist(member.user.id, listId, {
      title: "Still private",
      description: "",
      reservationsEnabled: true,
    });
    expect(await readWishlist(listId, member.user.id)).toMatchObject({
      visibility: "PRIVATE",
    });
    expect(
      await prisma.reservation.count({
        where: { wishId: "e2e-sharing-wish", endedAt: null },
      }),
    ).toBe(1);
    await changeMemberRole(
      owner.user.id,
      owner.session.id,
      listId,
      (await membership()).id,
      "MEMBER",
    );
    await expect(
      changeMemberRole(
        owner.user.id,
        owner.session.id,
        listId,
        (await membership()).id,
        "ADMIN",
      ),
    ).rejects.toThrow("Active Premium");
    await removeMember(
      member.user.id,
      member.session.id,
      listId,
      (await membership()).id,
    );
    expect(
      await prisma.reservation.count({
        where: { wishId: "e2e-sharing-wish", endedAt: null },
      }),
    ).toBe(0);
    expect(await readWishlist(listId, member.user.id)).toBeNull();
    await setVisibility(owner.user.id, owner.session.id, listId, "PUBLIC");
    await expect(
      setVisibility(owner.user.id, owner.session.id, listId, "PRIVATE"),
    ).rejects.toThrow("Active Premium");
  });

  it("uses the owner's entitlement, not an admin's plan, and protects the owner from every membership change", async () => {
    await join((await invite("ADMIN")).id);
    const ownerMembership = await prisma.membership.findUniqueOrThrow({
      where: {
        wishlistId_userId: { wishlistId: listId, userId: owner.user.id },
      },
    });
    await expect(
      removeMember(
        member.user.id,
        member.session.id,
        listId,
        ownerMembership.id,
      ),
    ).rejects.toThrow("owner");
    await expect(
      changeMemberRole(
        member.user.id,
        member.session.id,
        listId,
        ownerMembership.id,
        "MEMBER",
      ),
    ).rejects.toThrow("owner");
    await expect(
      transferOwnership(
        member.user.id,
        member.session.id,
        listId,
        ownerMembership.id,
      ),
    ).rejects.toThrow("Only the owner");
    await inviteMember(member.user.id, member.session.id, listId, {
      email: "first@example.test",
      role: "MEMBER",
    });
    await expirePremium();
    await premium(member.user.id);
    await expect(
      inviteMember(member.user.id, member.session.id, listId, {
        email: "second@example.test",
        role: "MEMBER",
      }),
    ).rejects.toThrow("Active Premium");
  });

  it("invalidates an admin's pending invitations on demotion or removal", async () => {
    await join((await invite("ADMIN")).id);
    const pending = await inviteMember(
      member.user.id,
      member.session.id,
      listId,
      { email: "third@example.test", role: "ADMIN" },
    );
    await changeMemberRole(
      owner.user.id,
      owner.session.id,
      listId,
      (await membership()).id,
      "MEMBER",
    );
    expect(
      await prisma.invitation.findUnique({ where: { id: pending.id } }),
    ).toMatchObject({ revokedAt: expect.any(Date) });
    await expect(
      inviteMember(member.user.id, member.session.id, listId, {
        email: "fourth@example.test",
        role: "MEMBER",
      }),
    ).rejects.toThrow("permission");
  });

  it("does not upgrade an existing member through an older admin invitation", async () => {
    const invitation = await invite("ADMIN");
    await prisma.membership.create({
      data: { wishlistId: listId, userId: member.user.id, role: "MEMBER" },
    });
    await join(invitation.id);
    expect((await membership()).role).toBe("MEMBER");
  });

  it("preserves independent public reservations on removal and ends them when the list becomes private", async () => {
    await setVisibility(owner.user.id, owner.session.id, listId, "PUBLIC");
    await join((await invite()).id);
    await reserveWish(member.user.id, listId, "e2e-sharing-wish");
    await removeMember(
      owner.user.id,
      owner.session.id,
      listId,
      (await membership()).id,
    );
    expect(
      await prisma.reservation.count({
        where: { wishId: "e2e-sharing-wish", endedAt: null },
      }),
    ).toBe(1);
    await setVisibility(owner.user.id, owner.session.id, listId, "PRIVATE");
    expect(
      await prisma.reservation.count({
        where: { wishId: "e2e-sharing-wish", endedAt: null },
      }),
    ).toBe(0);
  });

  it("transfers to an existing admin, retains content and reservations, and immediately uses the new owner's plan", async () => {
    await join((await invite("ADMIN")).id);
    const pending = await invite("MEMBER", "other@example.test");
    await reserveWish(member.user.id, listId, "e2e-sharing-wish");
    await transferOwnership(
      owner.user.id,
      owner.session.id,
      listId,
      (await membership()).id,
    );
    expect(await readWishlist(listId, owner.user.id)).toMatchObject({
      canManage: true,
      visibility: "PRIVATE",
    });
    expect(await readSharing(listId, owner.user.id)).toMatchObject({
      ownerId: member.user.id,
      premium: false,
    });
    expect(
      await prisma.reservation.count({
        where: { wishId: "e2e-sharing-wish", endedAt: null },
      }),
    ).toBe(1);
    await expect(invite()).rejects.toThrow("Active Premium");
    await revokeInvitation(
      member.user.id,
      member.session.id,
      listId,
      pending.id,
    );
  });

  it("rejects cross-list IDs and prevents a member managing or transferring a list", async () => {
    await join((await invite()).id);
    const other = await prisma.membership.findFirstOrThrow({
      where: { wishlistId: "e2e-private-list" },
    });
    await expect(
      removeMember(owner.user.id, owner.session.id, listId, other.id),
    ).rejects.toThrow("unavailable");
    await expect(
      transferOwnership(owner.user.id, owner.session.id, listId, other.id),
    ).rejects.toThrow("current admin");
    await expect(
      transferOwnership(
        owner.user.id,
        owner.session.id,
        listId,
        (await membership()).id,
      ),
    ).rejects.toThrow("current admin");
    await expect(
      setVisibility(member.user.id, member.session.id, listId, "PUBLIC"),
    ).rejects.toThrow("permission");
    expect(await readSharing("e2e-private-list", owner.user.id)).toBeNull();
  });

  it("does not expose draft titles in shared lists, but permits leaving unpublished memberships", async () => {
    await join((await invite()).id);
    await prisma.wishlist.update({
      where: { id: listId },
      data: { publication: "DRAFT" },
    });
    const shared = await readMyWishlists(member.user.id, 1, true);
    expect(shared.lists.find(({ id }) => id === listId)).toMatchObject({
      title: null,
      membership: { role: "MEMBER" },
      availableWishCount: 0,
      reservedWishCount: 0,
    });
    expect(JSON.stringify(shared)).not.toContain("Secret");
    await removeMember(
      member.user.id,
      member.session.id,
      listId,
      (await membership()).id,
    );
    expect(
      (await readMyWishlists(member.user.id, 1, true)).lists.find(
        ({ id }) => id === listId,
      ),
    ).toBeUndefined();
  });

  it("serializes acceptance with revocation and transfer with removal without losing an owner", async () => {
    const invitation = await invite("ADMIN");
    await Promise.allSettled([
      join(invitation.id),
      revokeInvitation(owner.user.id, owner.session.id, listId, invitation.id),
    ]);
    const record = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(!!(await membership().catch(() => null))).toBe(!!record.acceptedAt);
    if (!record.acceptedAt) await join((await invite("ADMIN")).id);
    const target = await membership();
    const results = await Promise.allSettled([
      transferOwnership(owner.user.id, owner.session.id, listId, target.id),
      removeMember(owner.user.id, owner.session.id, listId, target.id),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const list = await prisma.wishlist.findUniqueOrThrow({
      where: { id: listId },
    });
    expect(
      await prisma.membership.findUnique({
        where: {
          wishlistId_userId: { wishlistId: listId, userId: list.ownerId! },
        },
      }),
    ).toMatchObject({ role: "ADMIN" });
  });

  it("coordinates ownership transfer with account deletion and removes the deleted account's invitations", async () => {
    await join((await invite("ADMIN")).id);
    const target = await membership();
    const input = {
      password: accounts.member.password,
      confirmation: "DELETE",
      impactToken: (await readDeletionImpact(member.user.id)).impactToken,
    };
    const results = await Promise.allSettled([
      transferOwnership(owner.user.id, owner.session.id, listId, target.id),
      deleteAccount(member.user.id, member.session.id, input),
    ]);
    for (const result of results) {
      if (result.status === "rejected")
        expect(result.reason.message).toMatch(
          /current admin|review the updated summary/,
        );
    }
    if (await prisma.user.findUnique({ where: { id: member.user.id } })) {
      await deleteAccount(member.user.id, member.session.id, {
        ...input,
        impactToken: (await readDeletionImpact(member.user.id)).impactToken,
      });
    }
    expect(
      await prisma.wishlist.findUnique({ where: { id: listId } }),
    ).toMatchObject({ ownerId: owner.user.id, archivedAt: null });
    expect(
      await prisma.invitation.count({ where: { email: member.user.email } }),
    ).toBe(0);
  });

  it("paginates membership results and limits invitation abuse", async () => {
    await prisma.user.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        id: `e2e-shared-${index}`,
        username: `e2e-shared-${index}`,
        email: `shared-${index}@example.test`,
        emailVerified: true,
        passwordHash: owner.user.passwordHash,
      })),
    });
    await prisma.membership.createMany({
      data: Array.from({ length: 21 }, (_, index) => ({
        wishlistId: listId,
        userId: `e2e-shared-${index}`,
      })),
    });
    const first = await readSharing(listId, owner.user.id);
    const second = await readSharing(listId, owner.user.id, 2);
    expect(first?.memberships).toHaveLength(20);
    expect(first?.moreMembers).toBe(true);
    expect(second?.memberships).toHaveLength(2);
    for (let attempt = 0; attempt < 5; attempt++) {
      const invitation = await invite();
      await revokeInvitation(
        owner.user.id,
        owner.session.id,
        listId,
        invitation.id,
      );
    }
    await expect(invite()).rejects.toThrow("Too many attempts");
  });
});

describe("outcome-based list access", () => {
  it("only ends reservations for people losing access when a public list becomes private", async () => {
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "PUBLIC",
    });
    await join((await invite()).id);
    const kept = await reserveWish(member.user.id, listId, "e2e-sharing-wish");
    await prisma.user.create({
      data: {
        id: "e2e-access-visitor",
        username: "e2e-access-visitor",
        email: "e2e-access-visitor@example.test",
        emailVerified: true,
      },
    });
    await prisma.wish.create({
      data: {
        id: "e2e-visitor-wish",
        title: "Visitor's reserved gift",
        wishlistId: listId,
        reservations: {
          create: {
            id: "e2e-visitor-reservation",
            userId: "e2e-access-visitor",
          },
        },
      },
    });
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "PRIVATE",
      expectedAccess: "PUBLIC",
    });
    expect(
      (await prisma.reservation.findUniqueOrThrow({ where: { id: kept.id } }))
        .endedAt,
    ).toBeNull();
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: "e2e-visitor-reservation" },
        })
      ).endedAt,
    ).not.toBeNull();
    expect(await readWishlist(listId, member.user.id)).not.toBeNull();
    expect(await readWishlist(listId, "e2e-access-visitor")).toBeNull();
  });

  it.each(["PUBLIC", "PRIVATE"] as const)(
    "preserves a hidden list's saved %s audience and does not change access while reading settings",
    async (visibility) => {
      await prisma.wishlist.update({
        where: { id: listId },
        data: { visibility, publication: "DRAFT" },
      });
      const before = await prisma.wishlist.findUniqueOrThrow({
        where: { id: listId },
      });
      await readSharing(listId, owner.user.id);
      expect(
        await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toEqual(before);
      expect(await readWishlist(listId, null)).toBeNull();
      await setListAccess(owner.user.id, owner.session.id, listId, {
        access: "PUBLIC",
        expectedAccess: "HIDDEN",
      });
      expect(await readWishlist(listId, null)).not.toBeNull();
      await setListAccess(owner.user.id, owner.session.id, listId, {
        access: "HIDDEN",
        expectedAccess: "PUBLIC",
      });
      expect(
        await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toMatchObject({ publication: "DRAFT", visibility: "PUBLIC" });
      await setListAccess(owner.user.id, owner.session.id, listId, {
        access: "PRIVATE",
        expectedAccess: "HIDDEN",
      });
      expect(
        await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toMatchObject({ publication: "PUBLISHED", visibility: "PRIVATE" });
      expect(await readWishlist(listId, null)).toBeNull();
    },
  );

  it("shares a hidden public list privately with existing members and guest links in the invitation transaction", async () => {
    await join((await invite()).id);
    const guest = await createGuestLink(
      owner.user.id,
      owner.session.id,
      listId,
      { label: "Family", days: 7 },
    );
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PUBLIC", publication: "DRAFT" },
    });
    expect(await readWishlist(listId, member.user.id)).toBeNull();
    expect(await readGuestList(listId, guest.token)).toBeNull();
    const invitation = await inviteMember(
      owner.user.id,
      owner.session.id,
      listId,
      {
        email: "e2e-new-invitee@example.test",
        role: "MEMBER",
        shareAccess: "PRIVATE",
        expectedAccess: "HIDDEN",
      },
    );
    expect(
      await prisma.invitation.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ acceptedAt: null });
    expect(
      await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
    ).toMatchObject({ publication: "PUBLISHED", visibility: "PRIVATE" });
    expect(await readWishlist(listId, member.user.id)).not.toBeNull();
    expect(await readGuestList(listId, guest.token)).not.toBeNull();
    expect(await readWishlist(listId, null)).toBeNull();
  });

  it.each(["MEMBER", "ADMIN"] as const)(
    "keeps hidden access when inviting a %s without sharing",
    async (role) => {
      await prisma.wishlist.update({
        where: { id: listId },
        data: { visibility: "PUBLIC", publication: "DRAFT" },
      });
      const invitation = await inviteMember(
        owner.user.id,
        owner.session.id,
        listId,
        {
          email: accounts.member.email,
          role,
          shareAccess: "KEEP",
          expectedAccess: "HIDDEN",
        },
      );
      await join(invitation.id);
      expect(
        await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toMatchObject({ publication: "DRAFT", visibility: "PUBLIC" });
      expect(Boolean(await readWishlist(listId, member.user.id))).toBe(
        role === "ADMIN",
      );
      expect(await readWishlist(listId, null)).toBeNull();
    },
  );

  it("rolls back private sharing when the invitation fails and refuses stale or mismatched requests", async () => {
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PUBLIC", publication: "DRAFT" },
    });
    const input = {
      email: accounts.owner.email,
      role: "MEMBER",
      shareAccess: "PRIVATE",
      expectedAccess: "HIDDEN",
    };
    await expect(
      inviteMember(owner.user.id, owner.session.id, listId, input),
    ).rejects.toThrow("already belongs");
    expect(
      await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
    ).toMatchObject({ publication: "DRAFT", visibility: "PUBLIC" });
    await expect(
      inviteMember(owner.user.id, owner.session.id, listId, {
        ...input,
        email: accounts.member.email,
        role: "ADMIN",
      }),
    ).rejects.toThrow("List access changed");
    await expect(
      inviteMember(owner.user.id, owner.session.id, listId, {
        ...input,
        email: accounts.member.email,
        expectedAccess: undefined,
      }),
    ).rejects.toThrow("List access changed");
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "PUBLIC",
      expectedAccess: "HIDDEN",
    });
    await expect(
      inviteMember(owner.user.id, owner.session.id, listId, {
        ...input,
        email: accounts.member.email,
      }),
    ).rejects.toThrow("List access changed");
    await expect(
      setListAccess(owner.user.id, owner.session.id, listId, {
        access: "PRIVATE",
        expectedAccess: "HIDDEN",
      }),
    ).rejects.toThrow("List access changed");
    expect(
      await prisma.invitation.count({ where: { wishlistId: listId } }),
    ).toBe(0);
    expect(await readWishlist(listId, null)).not.toBeNull();
  });

  it("checks current authorization and owner Premium while preserving existing private access after expiry", async () => {
    await join((await invite()).id);
    await expect(
      setListAccess(member.user.id, member.session.id, listId, {
        access: "PUBLIC",
      }),
    ).rejects.toThrow("permission");
    await expect(
      setListAccess(owner.user.id, "expired-session", listId, {
        access: "PUBLIC",
      }),
    ).rejects.toThrow("session expired");
    await expirePremium();
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "HIDDEN",
    });
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "PRIVATE",
    });
    expect(await readWishlist(listId, member.user.id)).not.toBeNull();
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "PUBLIC",
    });
    await expect(
      setListAccess(owner.user.id, owner.session.id, listId, {
        access: "PRIVATE",
      }),
    ).rejects.toThrow("Active Premium");
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "HIDDEN",
    });
    await expect(
      inviteMember(owner.user.id, owner.session.id, listId, {
        email: "e2e-new-invitee@example.test",
        role: "MEMBER",
        shareAccess: "PRIVATE",
        expectedAccess: "HIDDEN",
      }),
    ).rejects.toThrow("Active Premium");
    expect(
      await prisma.wishlist.findUniqueOrThrow({ where: { id: listId } }),
    ).toMatchObject({ publication: "DRAFT", visibility: "PUBLIC" });
  });

  it("reviews every active reservation again under the list lock before hiding", async () => {
    await join((await invite()).id);
    const first = await reserveWish(member.user.id, listId, "e2e-sharing-wish");
    await expect(
      setListAccess(owner.user.id, owner.session.id, listId, {
        access: "HIDDEN",
      }),
    ).rejects.toBeInstanceOf(ReservationReviewRequired);
    await prisma.wish.create({
      data: {
        id: "e2e-access-second-wish",
        title: "Second reserved gift",
        wishlistId: listId,
      },
    });
    const second = await reserveWish(
      member.user.id,
      listId,
      "e2e-access-second-wish",
    );
    await expect(
      setListAccess(owner.user.id, owner.session.id, listId, {
        access: "HIDDEN",
        confirmedReservationIds: [first.id],
      }),
    ).rejects.toBeInstanceOf(ReservationReviewRequired);
    expect(
      await prisma.reservation.count({
        where: { wish: { wishlistId: listId }, endedAt: null },
      }),
    ).toBe(2);
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "HIDDEN",
      confirmedReservationIds: [first.id, second.id],
    });
    expect(
      await prisma.reservation.count({
        where: { wish: { wishlistId: listId }, endedAt: null },
      }),
    ).toBe(0);
    await setListAccess(owner.user.id, owner.session.id, listId, {
      access: "PRIVATE",
    });
    expect(
      await prisma.reservation.count({
        where: { wish: { wishlistId: listId }, endedAt: null },
      }),
    ).toBe(0);
  });
});
