import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { deliverAccountEmails } from "@/features/notifications/service/delivery";
import {
  inviteToReservation,
  respondToReservation,
} from "@/features/reservation/service/groups";
import { queueWishReservedEmail } from "@/features/reservation/service/owner-emails";
import {
  cancelReservation,
  reserveWish,
  revokeReservation,
} from "@/features/reservation/service/reservations";
import { createWish, transitionWish } from "@/features/wish/service/wishes";
import { createWishlist } from "@/features/wishlist/service/lists";
import { backgroundEvents } from "@/lib/background-events";
import { inngest } from "@/lib/inngest";
import * as mail from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase, testEnvironment } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

assertTestDatabase(process.env);
let listId: string;
let wishId: string;
const reserve = (groupEnabled = false) =>
  reserveWish("e2e-member", listId, wishId, groupEnabled);
const queued = (reservationId: string) =>
  prisma.accountEmail.findUniqueOrThrow({
    where: { key: `wish-reserved/${reservationId}` },
  });

beforeEach(async () => {
  await resetFixtures();
  ({ id: listId } = await createWishlist("e2e-owner", {
    title: "Birthday wishes",
    description: "",
    reservationsEnabled: true,
  }));
  ({ id: wishId } = await createWish("e2e-owner", listId, {
    title: "A beautiful notebook",
  }));
  await prisma.user.update({
    where: { id: "e2e-member" },
    data: { username: "private-reserver", name: "Private Reserver Name" },
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await resetFixtures();
  await prisma.$disconnect();
});

it.each(["en", "fi"])(
  "delivers the %s owner notification locally without reserver details",
  async (locale) => {
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { locale },
    });
    vi.mocked(inngest.send).mockImplementationOnce(async (payload) => {
      const [event] = Array.isArray(payload) ? payload : [payload];
      // A separate connection can see the outbox only after reservation commit.
      const email = await prisma.accountEmail.findUniqueOrThrow({
        where: { id: event.data?.id as string },
      });
      expect(await prisma.reservation.count({ where: { wishId } })).toBe(1);
      expect(payload).toEqual([
        {
          name: backgroundEvents.accountEmail,
          id: `${backgroundEvents.accountEmail}/${email.id}`,
          data: { id: email.id },
        },
      ]);
      return { ids: [email.id] };
    });
    const { id } = await reserve();
    const email = await queued(id);
    expect(email).toMatchObject({
      userId: "e2e-owner",
      recipient: accounts.owner.email,
      subject:
        locale === "fi" ? "Toiveesi on varattu" : "Your wish was reserved",
      sentAt: null,
    });
    expect(email.html).toContain(`lang="${locale}"`);
    expect(email.text).toContain("A beautiful notebook");
    expect(email.text).toContain("Birthday wishes");
    expect(email.text).toContain(
      `${testEnvironment.APP_URL}/${locale}/lists/${listId}/wishes/${wishId}`,
    );
    const payload = JSON.stringify({
      subject: email.subject,
      html: email.html,
      text: email.text,
      sender: email.sender,
    });
    for (const secret of [
      "private-reserver",
      "Private Reserver Name",
      accounts.member.email,
      "e2e-member",
      id,
      "/reservations/",
    ])
      expect(payload).not.toContain(secret);
    expect(await deliverAccountEmails(email.id)).toEqual({
      sent: 1,
      failed: 0,
      canceled: 0,
    });
    const message = await (
      await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/message/latest`)
    ).json();
    expect(message.Subject).toBe(email.subject);
    expect(message.Text).toContain("A beautiful notebook");
    expect(message.Text).not.toContain("Private Reserver Name");
    expect(message.HTML).not.toContain(accounts.member.email);
    expect((await queued(id)).text).toBe("");
  },
);

it("queues once for concurrent reservation requests and concurrent delivery workers", async () => {
  const results = await Promise.allSettled([reserve(), reserve(), reserve()]);
  expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
    1,
  );
  expect(await prisma.accountEmail.count()).toBe(1);
  const email = await prisma.accountEmail.findFirstOrThrow();
  expect(inngest.send).toHaveBeenCalledTimes(1);
  const send = vi
    .spyOn(mail, "deliverRenderedEmail")
    .mockResolvedValue({ error: null });
  await Promise.all([
    deliverAccountEmails(email.id),
    deliverAccountEmails(email.id),
  ]);
  await deliverAccountEmails(email.id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toBe(`wishlist-account-email/${email.id}`);
});

it("keeps one immutable notification for a group reservation, even when participants join", async () => {
  const { id } = await reserve(true);
  const email = await queued(id);
  expect(email.text).not.toContain("group");
  const guest = "e2e-private-participant";
  await prisma.user.create({
    data: {
      id: guest,
      username: guest,
      name: "Private Participant Name",
      email: `${guest}@example.test`,
      emailVerified: true,
    },
  });
  await prisma.membership.create({
    data: { wishlistId: listId, userId: guest },
  });
  await inviteToReservation("e2e-member", id, guest);
  await respondToReservation(guest, id, true);
  const repeated = await prisma.$transaction((tx) =>
    queueWishReservedEmail(tx, { id, wishId, userId: "e2e-member" }),
  );
  expect(repeated).toBe(email.id);
  expect(
    await prisma.accountEmail.count({
      where: { key: { startsWith: "wish-reserved/" } },
    }),
  ).toBe(1);
  expect((await queued(id)).html).toBe(email.html);
  expect(email.html).not.toContain(guest);
  expect(email.text).not.toContain("Private Participant Name");
});

it("notifies the owner of a private list, including wishes added by another admin", async () => {
  await prisma.wishlist.update({
    where: { id: listId },
    data: { visibility: "PRIVATE" },
  });
  await prisma.membership.create({
    data: { wishlistId: listId, userId: "e2e-member", role: "ADMIN" },
  });
  await prisma.wish.update({
    where: { id: wishId },
    data: { authorId: "e2e-member" },
  });
  const { id } = await reserve();
  const email = await queued(id);
  expect(email.recipient).toBe(accounts.owner.email);
  vi.spyOn(mail, "deliverRenderedEmail").mockResolvedValue({ error: null });
  expect(await deliverAccountEmails(email.id)).toEqual({
    sent: 1,
    failed: 0,
    canceled: 0,
  });
});

it.each(["self", "unverified-owner"])(
  "skips owner notification for %s while allowing the reservation",
  async (reason) => {
    if (reason === "unverified-owner")
      await prisma.user.update({
        where: { id: "e2e-owner" },
        data: { emailVerified: false },
      });
    await reserveWish(
      reason === "self" ? "e2e-owner" : "e2e-member",
      listId,
      wishId,
    );
    expect(await prisma.reservation.count({ where: { wishId } })).toBe(1);
    expect(await prisma.accountEmail.count()).toBe(0);
    expect(inngest.send).not.toHaveBeenCalled();
  },
);

it.each([
  "canceled",
  "revoked",
  "hidden",
  "fulfilled",
  "archived",
  "draft",
  "wish-deleted",
  "list-deleted",
  "owner-changed",
  "email-changed",
  "owner-unverified",
  "reserver-unverified",
  "reserver-deleted",
])("cancels a queued notification when %s before delivery", async (reason) => {
  const { id } = await reserve();
  const email = await queued(id);
  if (reason === "canceled")
    await cancelReservation("e2e-member", listId, wishId, id);
  if (reason === "revoked")
    await revokeReservation("e2e-owner", listId, wishId, id);
  if (reason === "hidden" || reason === "fulfilled")
    await transitionWish(
      "e2e-owner",
      listId,
      wishId,
      reason === "hidden" ? "hide" : "fulfill",
    );
  if (reason === "archived")
    await prisma.wishlist.update({
      where: { id: listId },
      data: { archivedAt: new Date() },
    });
  if (reason === "draft")
    await prisma.wishlist.update({
      where: { id: listId },
      data: { publication: "DRAFT" },
    });
  if (reason === "wish-deleted")
    await prisma.wish.delete({ where: { id: wishId } });
  if (reason === "list-deleted")
    await prisma.wishlist.delete({ where: { id: listId } });
  if (reason === "owner-changed")
    await prisma.$transaction(async (tx) => {
      await tx.membership.create({
        data: { wishlistId: listId, userId: "e2e-member", role: "ADMIN" },
      });
      await tx.wishlist.update({
        where: { id: listId },
        data: { ownerId: "e2e-member" },
      });
    });
  if (reason === "email-changed")
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { email: "changed@example.test" },
    });
  if (reason === "owner-unverified" || reason === "reserver-unverified")
    await prisma.user.update({
      where: { id: reason === "owner-unverified" ? "e2e-owner" : "e2e-member" },
      data: { emailVerified: false },
    });
  if (reason === "reserver-deleted") {
    await prisma.wishlist.delete({ where: { id: "e2e-private-list" } });
    await prisma.user.delete({ where: { id: "e2e-member" } });
  }
  const send = vi.spyOn(mail, "deliverRenderedEmail");
  expect(await deliverAccountEmails(email.id)).toEqual({
    sent: 0,
    failed: 0,
    canceled: 1,
  });
  expect(send).not.toHaveBeenCalled();
  expect(await queued(id)).toMatchObject({
    canceledAt: expect.any(Date),
    html: "",
    text: "",
  });
});

it("preserves the payload and locale across retries and recovers from event-publish failure", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(inngest.send).mockRejectedValueOnce(new Error("private-reserver"));
  const { id } = await reserve();
  const email = await queued(id);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private-reserver");
  const send = vi
    .spyOn(mail, "deliverRenderedEmail")
    .mockRejectedValueOnce(new Error("transport unavailable"))
    .mockResolvedValue({ error: null });
  expect(await deliverAccountEmails()).toEqual({
    sent: 0,
    failed: 1,
    canceled: 0,
  });
  await prisma.user.update({
    where: { id: "e2e-owner" },
    data: { locale: "fi" },
  });
  await prisma.wish.update({
    where: { id: wishId },
    data: { title: "Renamed wish" },
  });
  await prisma.wishlist.update({
    where: { id: listId },
    data: { title: "Renamed list" },
  });
  await prisma.accountEmail.update({
    where: { id: email.id },
    data: { nextAttemptAt: new Date(0) },
  });
  expect(await deliverAccountEmails()).toEqual({
    sent: 1,
    failed: 0,
    canceled: 0,
  });
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
});

it("notifies a new reservation only, canceling the previous pending event", async () => {
  const first = await reserve();
  await cancelReservation("e2e-member", listId, wishId, first.id);
  const second = await reserve();
  const send = vi
    .spyOn(mail, "deliverRenderedEmail")
    .mockResolvedValue({ error: null });
  expect(await deliverAccountEmails()).toEqual({
    sent: 1,
    failed: 0,
    canceled: 1,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect((await queued(first.id)).canceledAt).not.toBeNull();
  expect((await queued(second.id)).sentAt).not.toBeNull();
});

it("rolls back the reservation and publishes nothing when queue creation fails", async () => {
  vi.spyOn(mail, "emailSender").mockImplementationOnce(() => {
    throw new Error("queue unavailable");
  });
  await expect(reserve()).rejects.toThrow("queue unavailable");
  expect(await prisma.reservation.count({ where: { wishId } })).toBe(0);
  expect(await prisma.accountEmail.count()).toBe(0);
  expect(inngest.send).not.toHaveBeenCalled();
});

it("notifies about an existing active reservation even after new reservations are disabled", async () => {
  const { id } = await reserve();
  const email = await queued(id);
  await prisma.wishlist.update({
    where: { id: listId },
    data: { reservationsEnabled: false },
  });
  vi.spyOn(mail, "deliverRenderedEmail").mockResolvedValue({ error: null });
  expect(await deliverAccountEmails(email.id)).toEqual({
    sent: 1,
    failed: 0,
    canceled: 0,
  });
});
