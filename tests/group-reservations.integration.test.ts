import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import {
  deleteAccount,
  readDeletionImpact,
} from "@/features/account/service/account";
import { consumeRateLimit } from "@/features/auth/service/security";
import { readableImage } from "@/features/media/service/media";
import { deliverAccountEmails } from "@/features/notifications/service/delivery";
import {
  manageGroup,
  reserveWithGroup,
} from "@/features/reservation/actions/manage-group";
import { queueGroupEmail } from "@/features/reservation/service/group-emails";
import {
  enableReservationGroup,
  inviteToReservation,
  readGroupInvitations,
  readReservationGroup,
  removeReservationParticipant,
  respondToReservation,
  searchGroupPeople,
  transferReservation,
} from "@/features/reservation/service/groups";
import {
  cancelReservation,
  readMyReservations,
  reserveWish,
  revokeReservation,
} from "@/features/reservation/service/reservations";
import { readWish, transitionWish } from "@/features/wish/service/wishes";
import { backgroundEvents } from "@/lib/background-events";
import { inngest } from "@/lib/inngest";
import * as mail from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

const auth = vi.hoisted(() => ({ userId: "e2e-member" }));
vi.mock("@/features/auth/queries/get-auth-or-redirect", () => ({
  getAuthOrRedirect: async () => ({ user: { id: auth.userId } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
assertTestDatabase(process.env);
const listId = "e2e-group-list";
const wishId = "e2e-group-wish";
const organizer = "e2e-member";
const guest = "e2e-guest";
const second = "e2e-second";
let id: string;
const active = () =>
  prisma.reservation.findMany({ where: { wishId, endedAt: null } });
const invite = (person = guest) => inviteToReservation(organizer, id, person);
const join = async (person = guest) => {
  await invite(person);
  await respondToReservation(person, id, true);
};
const membership = (userId: string) =>
  prisma.membership.create({ data: { userId, wishlistId: listId } });
const makePrivate = () =>
  prisma.wishlist.update({
    where: { id: listId },
    data: { visibility: "PRIVATE" },
  });

beforeEach(async () => {
  await resetFixtures();
  auth.userId = organizer;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: organizer },
  });
  await prisma.user.createMany({
    data: [guest, second, "e2e-hidden", "e2e-unverified"].map((id) => ({
      id,
      username: id,
      name: `Name ${id}`,
      email: `${id}@example.test`,
      passwordHash: user.passwordHash,
      emailVerified: id !== "e2e-unverified",
    })),
  });
  await prisma.wishlist.create({
    data: {
      id: listId,
      title: "Group gifts",
      ownerId: "e2e-owner",
      publication: "PUBLISHED",
      reservationsEnabled: true,
      memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
      wishes: { create: { id: wishId, title: "Together gift", priority: 5 } },
    },
  });
  await membership(guest);
  await membership(second);
  ({ id } = await reserveWish(organizer, listId, wishId, true));
  // Owner mail is covered separately; this fixture isolates group notifications.
  await prisma.accountEmail.deleteMany({
    where: { key: `wish-reserved/${id}` },
  });
  vi.mocked(inngest.send).mockClear();
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

describe("group reservations", () => {
  it("shares identities only after consent and keeps pending access scoped", async () => {
    await join();
    await invite(second);
    const pending = await readReservationGroup(second, id);
    expect(pending).toMatchObject({
      pending: true,
      people: [],
      size: 2,
      inviter: { username: organizer },
    });
    expect(JSON.stringify(pending)).not.toContain(guest);
    expect(await readWish(listId, wishId, second)).toBeNull();
    expect((await readMyReservations(second)).reservations).toEqual([]);
    expect((await readGroupInvitations(second)).invitations).toHaveLength(1);
    await respondToReservation(second, id, true);
    expect(
      (await readReservationGroup(second, id))?.people.map((p) => p.id).sort(),
    ).toEqual([organizer, guest, second].sort());
    expect(await readWish(listId, wishId, second)).toMatchObject({
      isReservedByYou: true,
      isGroupReservation: true,
    });
    expect((await readMyReservations(second)).reservations).toMatchObject([
      { id, groupEnabled: true, wish: { priority: 5 } },
    ]);
    expect(await readReservationGroup("e2e-owner", id)).toBeNull();
    expect(
      JSON.stringify(await readWish(listId, wishId, "e2e-owner")),
    ).not.toContain(organizer);
    expect(
      JSON.stringify(await readReservationGroup(second, id)),
    ).not.toContain("@example.test");
  });

  it("uses session identity and requires explicit identity-sharing consent", async () => {
    await invite();
    auth.userId = guest;
    const data = new FormData();
    data.set("operation", "accept");
    data.set("userId", organizer);
    expect((await manageGroup(id, EMPTY_ACTION_STATE, data)).status).toBe(
      "ERROR",
    );
    expect((await readReservationGroup(guest, id))?.pending).toBe(true);
    data.set("confirm", "on");
    expect((await manageGroup(id, EMPTY_ACTION_STATE, data)).status).toBe(
      "SUCCESS",
    );
    expect((await readReservationGroup(guest, id))?.pending).toBe(false);
    data.set("operation", "cancel");
    expect((await manageGroup(id, EMPTY_ACTION_STATE, data)).status).toBe(
      "ERROR",
    );
    await cancelReservation(organizer, listId, wishId, id);
    auth.userId = organizer;
    expect(
      (
        await reserveWithGroup(
          listId,
          wishId,
          EMPTY_ACTION_STATE,
          new FormData(),
        )
      ).status,
    ).toBe("ERROR");
    expect(await active()).toHaveLength(0);
  });

  it("bounds search to eligible discoverable people and never returns email addresses", async () => {
    const results = await searchGroupPeople(organizer, id, "e2e");
    expect(results.map((p) => p.id)).toEqual(
      expect.arrayContaining([guest, second, "e2e-owner"]),
    );
    expect(results.map((p) => p.id)).not.toContain("e2e-hidden");
    expect(results.map((p) => p.id)).not.toContain("e2e-unverified");
    expect(JSON.stringify(results)).not.toContain("email");
    expect(await searchGroupPeople(guest, id, "e2e")).toEqual([]);
    expect(await searchGroupPeople(organizer, id, "e")).toEqual([]);
    await expect(invite("e2e-hidden")).rejects.toThrow();
    await invite();
    expect(
      (await searchGroupPeople(organizer, id, "e2e")).map((p) => p.id),
    ).not.toContain(guest);
  });

  it("invites by exact verified email and applies the same list access and duplicate rules", async () => {
    await membership(organizer);
    await makePrivate();
    const byEmail = (email: string) =>
      inviteToReservation(organizer, id, { email });
    for (const email of [
      "unknown@example.test",
      "e2e-hidden@example.test",
      "e2e-unverified@example.test",
    ]) {
      await expect(byEmail(email)).rejects.toThrow(
        "This address cannot receive a group invitation",
      );
    }
    expect(
      await prisma.reservationParticipant.count({
        where: { reservationId: id },
      }),
    ).toBe(0);
    await byEmail("  E2E-GUEST@EXAMPLE.TEST  ");
    expect(
      (await readReservationGroup(organizer, id))?.invitations.map(
        (person) => person.id,
      ),
    ).toEqual([guest]);
    await expect(invite(guest)).rejects.toThrow("already been invited");
  });

  it("shows only the organizer’s eligible favorites and removes previously invited people", async () => {
    for (const userId of [guest, second]) {
      await prisma.wishlist.create({
        data: {
          title: userId,
          id: `e2e-favorite-list-${userId}`,
          ownerId: userId,
          memberships: { create: { userId, role: "ADMIN" } },
          publication: "PUBLISHED",
          visibility: "PUBLIC",
        },
      });
      await prisma.favoritePerson.create({
        data: { userId: organizer, personId: userId },
      });
    }
    await membership(organizer);
    await makePrivate();
    await prisma.membership.delete({
      where: { wishlistId_userId: { wishlistId: listId, userId: second } },
    });
    const favorites = (await readReservationGroup(organizer, id))?.favorites;
    expect(favorites?.map((person) => person.id)).toEqual([guest]);
    expect(favorites?.[0]).not.toHaveProperty("email");
    await invite();
    expect((await readReservationGroup(guest, id))?.favorites).toEqual([]);
    await respondToReservation(guest, id, false);
    expect((await readReservationGroup(organizer, id))?.favorites).toEqual([]);
  });

  it("returns public avatars without exposing private members' media", async () => {
    await prisma.media.deleteMany({
      where: { id: { startsWith: "e2e-group-avatar-" } },
    });
    await prisma.media.createMany({
      data: [guest, "e2e-owner"].map((userId) => ({
        id: `e2e-group-avatar-${userId}`,
        pathname: `e2e-group-avatar-${userId}-${Date.now()}.webp`,
        provider: "LOCAL" as const,
        state: "READY" as const,
        alt: "Profile image",
        width: 100,
        height: 100,
        bytes: 100,
        cleanupAfter: new Date(),
        userId,
      })),
    });
    const results = await searchGroupPeople(organizer, id, "e2e");
    expect(results.find((person) => person.id === guest)?.image).toBeNull();
    expect(
      results.find((person) => person.id === "e2e-owner")?.image,
    ).toMatchObject({
      id: "e2e-group-avatar-e2e-owner",
      alt: "",
      width: 100,
      height: 100,
    });
    expect(JSON.stringify(results)).not.toContain("pathname");
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PRIVATE" },
    });
    expect(await searchGroupPeople(organizer, id, "e2e-owner")).toEqual([]);
  });

  it("enforces the ten-person limit under concurrent invitations", async () => {
    await prisma.user.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        id: `e2e-invite-${i}`,
        username: `e2e-invite-${i}`,
        email: `invite-${i}@example.test`,
        emailVerified: true,
        passwordHash: "unused",
      })),
    });
    await prisma.membership.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        userId: `e2e-invite-${i}`,
        wishlistId: listId,
      })),
    });
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => invite(`e2e-invite-${i}`)),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(9);
    expect((await readReservationGroup(organizer, id))?.occupied).toBe(10);
  });

  it.each(["decline", "expire", "revoke"])(
    "leaves the reservation intact after %s and prevents re-invitation",
    async (mode) => {
      await invite();
      if (mode === "decline") await respondToReservation(guest, id, false);
      if (mode === "expire")
        await prisma.reservationParticipant.updateMany({
          where: { reservationId: id },
          data: { expiresAt: new Date(0) },
        });
      if (mode === "revoke")
        await removeReservationParticipant(organizer, id, guest);
      expect(await active()).toHaveLength(1);
      expect(await readReservationGroup(guest, id)).toBeNull();
      expect((await readGroupInvitations(guest)).invitations).toEqual([]);
      await expect(respondToReservation(guest, id, true)).rejects.toThrow();
      await expect(invite()).rejects.toThrow();
    },
  );

  it("requires independent private access and never accepts an invitation for a later reservation", async () => {
    await membership(organizer);
    await invite();
    await makePrivate();
    await prisma.membership.delete({
      where: { wishlistId_userId: { wishlistId: listId, userId: guest } },
    });
    await expect(respondToReservation(guest, id, true)).rejects.toThrow();
    await membership(guest);
    await expect(respondToReservation(guest, id, true)).rejects.toThrow();
    await cancelReservation(organizer, listId, wishId, id);
    const later = await reserveWish(organizer, listId, wishId, true);
    await expect(respondToReservation(guest, id, true)).rejects.toThrow();
    expect((await active())[0].id).toBe(later.id);
  });

  it("preserves accepted participants while disabled and blocks group creation, invites and acceptance", async () => {
    await join();
    await invite(second);
    await prisma.wishlist.update({
      where: { id: listId },
      data: { reservationsEnabled: false },
    });
    expect(await readReservationGroup(guest, id)).not.toBeNull();
    await expect(respondToReservation(second, id, true)).rejects.toThrow();
    await expect(invite("e2e-owner")).rejects.toThrow();
    await expect(enableReservationGroup(organizer, id)).rejects.toThrow();
    await respondToReservation(second, id, false);
    await removeReservationParticipant(guest, id, guest);
    expect(await active()).toHaveLength(1);
  });

  it("supports transfer and leaving, cancels pending invites, and rejects former-organizer changes", async () => {
    await join();
    await invite(second);
    await expect(
      removeReservationParticipant(organizer, id, organizer),
    ).rejects.toThrow();
    await expect(transferReservation(organizer, id, second)).rejects.toThrow();
    await transferReservation(organizer, id, guest);
    expect((await active())[0].userId).toBe(guest);
    expect((await readReservationGroup(organizer, id))?.people).toHaveLength(2);
    expect(await readReservationGroup(second, id)).toBeNull();
    await expect(
      cancelReservation(organizer, listId, wishId, id),
    ).rejects.toThrow();
    await removeReservationParticipant(organizer, id, organizer);
    expect(await readWish(listId, wishId, organizer)).toBeNull();
    expect(await active()).toHaveLength(1);
  });

  it("removes only people who lose access and never restores them after permissions return", async () => {
    await join();
    await join(second);
    await membership(organizer);
    await makePrivate();
    await prisma.membership.delete({
      where: { wishlistId_userId: { wishlistId: listId, userId: guest } },
    });
    expect(
      (await readReservationGroup(organizer, id))?.people.map((p) => p.id),
    ).toEqual(expect.arrayContaining([organizer, second]));
    expect(await readReservationGroup(guest, id)).toBeNull();
    await membership(guest);
    expect(await readReservationGroup(guest, id)).toBeNull();
    await prisma.membership.delete({
      where: { wishlistId_userId: { wishlistId: listId, userId: organizer } },
    });
    expect((await active())[0].userId).toBe(second);
    await membership(organizer);
    expect(await readReservationGroup(organizer, id)).toBeNull();
  });

  it.each(["hide", "fulfill", "unpublish", "archive", "revoke", "delete"])(
    "ends the entire group on %s without resurrecting invitations",
    async (mode) => {
      await join();
      await invite(second);
      if (mode === "hide" || mode === "fulfill") {
        await transitionWish("e2e-owner", listId, wishId, mode);
        await transitionWish(
          "e2e-owner",
          listId,
          wishId,
          mode === "hide" ? "unhide" : "reopen",
        );
      }
      if (mode === "unpublish") {
        await prisma.wishlist.update({
          where: { id: listId },
          data: { publication: "DRAFT" },
        });
        await prisma.wishlist.update({
          where: { id: listId },
          data: { publication: "PUBLISHED" },
        });
      }
      if (mode === "archive")
        await prisma.wishlist.update({
          where: { id: listId },
          data: { archivedAt: new Date() },
        });
      if (mode === "revoke")
        await revokeReservation("e2e-owner", listId, wishId, id);
      if (mode === "delete")
        await prisma.wish.delete({ where: { id: wishId } });
      expect(await active()).toEqual([]);
      expect(await readReservationGroup(guest, id)).toBeNull();
      expect((await readGroupInvitations(second)).invitations).toEqual([]);
    },
  );

  it.each(["organizer", "participant", "unverified"])(
    "handles %s account removal without leaking access",
    async (mode) => {
      await join();
      await join(second);
      if (mode === "organizer") {
        const impact = await readDeletionImpact(organizer);
        await prisma.session.create({
          data: {
            id: "e2e-group-session",
            userId: organizer,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await deleteAccount(organizer, "e2e-group-session", {
          password: accounts.member.password,
          confirmation: "DELETE",
          impactToken: impact.impactToken,
        });
        expect((await active())[0].userId).toBe(guest);
        expect((await readReservationGroup(second, id))?.people).toHaveLength(
          2,
        );
      } else {
        if (mode === "participant")
          await prisma.user.delete({ where: { id: guest } });
        else
          await prisma.user.update({
            where: { id: guest },
            data: { emailVerified: false },
          });
        expect(
          (await readReservationGroup(organizer, id))?.people,
        ).toHaveLength(2);
        expect(await readReservationGroup(guest, id)).toBeNull();
      }
    },
  );

  it("protects private media before acceptance and after leaving", async () => {
    const image = await prisma.media.create({
      data: {
        pathname: `e2e-group-image-${crypto.randomUUID()}`,
        provider: "LOCAL",
        state: "READY",
        width: 1,
        height: 1,
        bytes: 1,
        alt: "Group gift",
        wishId,
        cleanupAfter: new Date(),
      },
    });
    await invite();
    expect(await readableImage(image.id, guest)).toBeNull();
    await respondToReservation(guest, id, true);
    expect(await readableImage(image.id, guest)).not.toBeNull();
    await removeReservationParticipant(guest, id, guest);
    expect(await readableImage(image.id, guest)).toBeNull();
  });

  it.each(["remove", "private", "cancel", "hide"])(
    "serializes acceptance with %s",
    async (mode) => {
      await invite();
      if (mode === "remove") {
        await membership(organizer);
        await makePrivate();
      }
      const mutate = () =>
        mode === "remove"
          ? prisma.membership.delete({
              where: {
                wishlistId_userId: { wishlistId: listId, userId: guest },
              },
            })
          : mode === "private"
            ? makePrivate()
            : mode === "cancel"
              ? cancelReservation(organizer, listId, wishId, id)
              : transitionWish("e2e-owner", listId, wishId, "hide");
      const outcomes = await Promise.allSettled([
        respondToReservation(guest, id, true),
        mutate(),
      ]);
      expect(outcomes[1].status).toBe("fulfilled");
      if (mode === "private") {
        expect(await readReservationGroup(organizer, id)).toBeNull();
        const remaining = await active();
        if (remaining.length) {
          expect(remaining[0].userId).toBe(guest);
          expect(await readReservationGroup(guest, id)).not.toBeNull();
        } else expect(await readReservationGroup(guest, id)).toBeNull();
      } else expect(await readReservationGroup(guest, id)).toBeNull();
    },
  );

  it("preserves the single-reservation constraint when individuals compete with groups", async () => {
    await cancelReservation(organizer, listId, wishId, id);
    const outcomes = await Promise.allSettled([
      reserveWish(organizer, listId, wishId, true),
      reserveWish(guest, listId, wishId),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await active()).toHaveLength(1);
  });
  it("rejects forged group-management targets and concurrent acceptance replays", async () => {
    await invite();
    await expect(inviteToReservation(guest, id, second)).rejects.toThrow();
    await expect(
      removeReservationParticipant(guest, id, second),
    ).rejects.toThrow();
    await expect(transferReservation(guest, id, organizer)).rejects.toThrow();
    const outcomes = await Promise.allSettled([
      respondToReservation(guest, id, true),
      respondToReservation(guest, id, true),
    ]);
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await readReservationGroup(organizer, id))?.size).toBe(2);
  });

  it("ends a group when its organizer is deleted and only pending invitees remain", async () => {
    await invite();
    await prisma.wishlist.delete({ where: { id: "e2e-private-list" } });
    await prisma.user.delete({ where: { id: organizer } });
    expect(await active()).toEqual([]);
    expect((await readGroupInvitations(guest)).invitations).toEqual([]);
    expect(await readReservationGroup(guest, id)).toBeNull();
  });

  it("limits repeated invitations across canceled and recreated reservations", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await invite();
      await respondToReservation(guest, id, false);
      await cancelReservation(organizer, listId, wishId, id);
      ({ id } = await reserveWish(organizer, listId, wishId, true));
    }
    await expect(invite()).rejects.toThrow("Too many attempts");
    expect((await readGroupInvitations(guest)).invitations).toEqual([]);
    expect((await active())[0].id).toBe(id);
  });

  it("invalidates deletion review when group participation changes", async () => {
    await invite();
    const before = await readDeletionImpact(guest);
    await respondToReservation(guest, id, true);
    const after = await readDeletionImpact(guest);
    expect(after.impactToken).not.toBe(before.impactToken);
  });
});

describe("group email notifications", () => {
  it("queues once in the recipient language, delivers locally, and notifies the organizer after acceptance", async () => {
    await prisma.user.update({ where: { id: guest }, data: { locale: "fi" } });
    await invite();
    const invitation = await prisma.accountEmail.findFirstOrThrow();
    expect(invitation).toMatchObject({
      userId: guest,
      groupEmailKind: "INVITED",
      recipient: `${guest}@example.test`,
      subject: "Sinut on kutsuttu ryhmävaraukseen",
      sentAt: null,
    });
    expect(invitation.html).toContain('lang="fi"');
    expect(invitation.html).toContain(`/fi/reservations/${id}`);
    expect(invitation.text).toContain(organizer);
    expect(invitation.text).toContain(`@${organizer}`);
    expect(invitation.text).not.toContain("Together gift");
    expect(inngest.send).toHaveBeenCalledWith([
      {
        name: backgroundEvents.accountEmail,
        id: `${backgroundEvents.accountEmail}/${invitation.id}`,
        data: { id: invitation.id },
      },
    ]);
    await expect(invite()).rejects.toThrow("already been invited");
    expect(await prisma.accountEmail.count()).toBe(1);
    expect(await deliverAccountEmails()).toEqual({
      sent: 1,
      failed: 0,
      canceled: 0,
    });
    const inbox = await fetch(
      `${process.env.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${guest}@example.test subject:Sinut`)}`,
    );
    expect((await inbox.json()).messages.length).toBeGreaterThan(0);
    await respondToReservation(guest, id, true);
    await expect(respondToReservation(guest, id, true)).rejects.toThrow();
    const accepted = await prisma.accountEmail.findFirstOrThrow({
      where: { groupEmailKind: "ACCEPTED" },
    });
    expect(accepted).toMatchObject({
      userId: organizer,
      recipient: accounts.member.email,
    });
    expect(accepted.text).toContain(`Name ${guest}`);
    expect(accepted.text).toContain(`Name ${guest} (@${guest})`);
    expect(accepted.html).toContain(`/en/reservations/${id}`);
    expect(accepted.text).not.toContain("Together gift");
    expect(inngest.send).toHaveBeenCalledWith([
      {
        name: backgroundEvents.accountEmail,
        id: `${backgroundEvents.accountEmail}/${accepted.id}`,
        data: { id: accepted.id },
      },
    ]);
    expect(await deliverAccountEmails()).toEqual({
      sent: 1,
      failed: 0,
      canceled: 0,
    });
    expect(await deliverAccountEmails()).toEqual({
      sent: 0,
      failed: 0,
      canceled: 0,
    });
    expect(await prisma.accountEmail.count()).toBe(2);
  });

  it.each([
    "declined",
    "expired",
    "revoked",
    "ended",
    "hidden",
    "private",
    "disabled",
    "unverified",
    "email-changed",
  ])("skips a %s invitation before delivery", async (reason) => {
    await invite();
    if (reason === "declined") await respondToReservation(guest, id, false);
    if (reason === "expired")
      await prisma.reservationParticipant.updateMany({
        where: { reservationId: id },
        data: { expiresAt: new Date(0) },
      });
    if (reason === "revoked")
      await removeReservationParticipant(organizer, id, guest);
    if (reason === "ended")
      await cancelReservation(organizer, listId, wishId, id);
    if (reason === "hidden")
      await transitionWish("e2e-owner", listId, wishId, "hide");
    if (reason === "private") await makePrivate();
    if (reason === "disabled")
      await prisma.wishlist.update({
        where: { id: listId },
        data: { reservationsEnabled: false },
      });
    if (reason === "unverified")
      await prisma.user.update({
        where: { id: guest },
        data: { emailVerified: false },
      });
    if (reason === "email-changed")
      await prisma.user.update({
        where: { id: guest },
        data: { email: "new@example.test" },
      });
    const transport = vi.spyOn(mail, "deliverRenderedEmail");
    expect(await deliverAccountEmails()).toEqual({
      sent: 0,
      failed: 0,
      canceled: 1,
    });
    expect(transport).not.toHaveBeenCalled();
    const email = await prisma.accountEmail.findFirstOrThrow();
    expect(email).toMatchObject({
      canceledAt: expect.any(Date),
      html: "",
      text: "",
    });
    expect(await prisma.accountEmail.count()).toBe(1);
  });

  it.each(["left", "transferred", "ended", "private"])(
    "skips acceptance updates after the group is %s",
    async (reason) => {
      await join();
      if (reason === "left")
        await removeReservationParticipant(guest, id, guest);
      if (reason === "transferred")
        await transferReservation(organizer, id, guest);
      if (reason === "ended")
        await cancelReservation(organizer, listId, wishId, id);
      if (reason === "private") await makePrivate();
      const transport = vi.spyOn(mail, "deliverRenderedEmail");
      expect(await deliverAccountEmails()).toEqual({
        sent: 0,
        failed: 0,
        canceled: 2,
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("retries an unchanged payload with one claim and key, then cancels a stale retry", async () => {
    await invite();
    const transport = vi
      .spyOn(mail, "deliverRenderedEmail")
      .mockRejectedValue(new Error("offline"));
    await Promise.all([deliverAccountEmails(), deliverAccountEmails()]);
    expect(transport).toHaveBeenCalledTimes(1);
    const email = await prisma.accountEmail.findFirstOrThrow();
    expect(email.deliveryAttempts).toBe(1);
    await prisma.user.update({
      where: { id: organizer },
      data: { name: "Changed name" },
    });
    await prisma.accountEmail.update({
      where: { id: email.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await deliverAccountEmails();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[0]);
    await removeReservationParticipant(organizer, id, guest);
    await prisma.accountEmail.update({
      where: { id: email.id },
      data: { nextAttemptAt: new Date(0) },
    });
    expect((await deliverAccountEmails()).canceled).toBe(1);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("bounds invitation email volume per recipient across organizers", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await consumeRateLimit(
        "reservation-group-invite-recipient",
        guest,
        10,
        60 * 60 * 1000,
      );
    }
    await expect(invite()).rejects.toThrow();
    expect(await prisma.accountEmail.count()).toBe(0);
    expect(await prisma.reservationParticipant.count()).toBe(0);
  });

  it("rolls back notification intent and cascades queued content on participant deletion", async () => {
    await invite();
    const participant = await prisma.reservationParticipant.findFirstOrThrow({
      where: { reservationId: id },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await queueGroupEmail(tx, {
          participantId: participant.id,
          reservationId: id,
          recipientId: organizer,
          actorId: guest,
          kind: "ACCEPTED",
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.accountEmail.count()).toBe(1);
    await prisma.user.delete({ where: { id: guest } });
    expect(await prisma.accountEmail.count()).toBe(0);
  });
});
