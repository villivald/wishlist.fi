import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { authenticate } from "@/features/auth/service/accounts";
import { deliverAccountEmails } from "@/features/notifications/service/delivery";
import { deliverInvitations } from "@/features/sharing/service/delivery";
import {
  acceptInvitation,
  inviteMember,
  revokeInvitation,
} from "@/features/sharing/service/invitations";
import * as mail from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase, testEnvironment } from "../e2e/environment";
import { accounts, resetFixtures } from "../e2e/seed";

assertTestDatabase(process.env);
let account: Awaited<ReturnType<typeof authenticate>>;
let id: string;

beforeEach(async () => {
  await resetFixtures();
  account = await authenticate(accounts.member.email, accounts.member.password);
  await prisma.premiumGrant.create({
    data: {
      userId: account.user.id,
      startsAt: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  ({ id } = await inviteMember(
    account.user.id,
    account.session.id,
    "e2e-private-list",
    { email: accounts.owner.email, role: "MEMBER" },
  ));
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await resetFixtures();
  await prisma.$disconnect();
});

describe("durable invitation delivery", () => {
  it("does not deliver an account invitation to a changed or unverified email", async () => {
    const send = vi
      .spyOn(mail, "deliverEmail")
      .mockResolvedValue({ error: null });
    await prisma.invitation.update({
      where: { id },
      data: { recipientId: "e2e-owner" },
    });
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { email: "e2e-changed@example.test" },
    });
    expect(await deliverInvitations(id)).toEqual({ sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id } }))
        .deliveryFailedAt,
    ).not.toBeNull();
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { email: accounts.owner.email, emailVerified: false },
    });
    await prisma.invitation.update({
      where: { id },
      data: { deliveryFailedAt: null, nextAttemptAt: new Date() },
    });
    expect(await deliverInvitations(id)).toEqual({ sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it("claims once across concurrent workers and never resends a successful delivery", async () => {
    const send = vi
      .spyOn(mail, "deliverEmail")
      .mockResolvedValue({ error: null });
    const results = await Promise.all([
      deliverInvitations(id),
      deliverInvitations(id),
      deliverInvitations(id),
    ]);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][3]).toBe(`wishlist-invitation/${id}`);
    expect(JSON.stringify(send.mock.calls)).toContain(
      "Another person's private list",
    );
    expect(send.mock.calls[0][1]).toBe(
      "Your Wishlist invitation: Another person's private list",
    );
    expect(send.mock.calls[0][2].props).toMatchObject({
      listTitle: "Another person's private list",
      inviterUsername: "e2e-member",
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain("Private wish");
    await deliverInvitations(id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.invitation.findUnique({ where: { id } })).toMatchObject(
      { sentAt: expect.any(Date), deliveryAttempts: 1, claimId: null },
    );
  });

  it("retains failed sends, respects backoff and retries with the same provider key", async () => {
    const send = vi
      .spyOn(mail, "deliverEmail")
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValue({ error: null });
    expect(await deliverInvitations(id)).toEqual({ sent: 0, failed: 1 });
    expect(await deliverInvitations(id)).toEqual({ sent: 0, failed: 0 });
    await prisma.invitation.update({
      where: { id },
      data: { nextAttemptAt: new Date(0) },
    });
    expect(await deliverInvitations(id)).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls[0][3]).toBe(send.mock.calls[1][3]);
    expect(await prisma.invitation.findUnique({ where: { id } })).toMatchObject(
      { sentAt: expect.any(Date), deliveryAttempts: 2 },
    );
  });

  it("recovers an abandoned claim but never retries beyond the provider's idempotency window", async () => {
    const send = vi
      .spyOn(mail, "deliverEmail")
      .mockResolvedValue({ error: null });
    await prisma.invitation.update({
      where: { id },
      data: {
        claimId: "abandoned",
        deliveryAttempts: 1,
        firstAttemptAt: new Date(Date.now() - 180000),
        nextAttemptAt: new Date(0),
      },
    });
    expect(await deliverInvitations(id)).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    await prisma.invitation.update({
      where: { id },
      data: {
        sentAt: null,
        nextAttemptAt: new Date(0),
        firstAttemptAt: new Date(Date.now() - 24 * 3600000),
      },
    });
    expect(await deliverInvitations(id)).toEqual({ sent: 0, failed: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.invitation.findUnique({ where: { id } })).toMatchObject(
      { deliveryFailedAt: expect.any(Date) },
    );
  });

  it("stops after bounded failures and leaves a visible failure state", async () => {
    const send = vi
      .spyOn(mail, "deliverEmail")
      .mockRejectedValue(new Error("offline"));
    await prisma.invitation.update({
      where: { id },
      data: { deliveryAttempts: 7 },
    });
    await deliverInvitations(id);
    await prisma.invitation.update({
      where: { id },
      data: { nextAttemptAt: new Date(0) },
    });
    await deliverInvitations(id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await prisma.invitation.findUnique({ where: { id } })).toMatchObject(
      { deliveryAttempts: 8, deliveryFailedAt: expect.any(Date) },
    );
  });

  it("pauses for expired Premium and never delivers revoked invitations", async () => {
    const send = vi
      .spyOn(mail, "deliverEmail")
      .mockResolvedValue({ error: null });
    await prisma.premiumGrant.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await deliverInvitations(id);
    expect(send).not.toHaveBeenCalled();
    await prisma.premiumGrant.updateMany({
      data: { expiresAt: new Date(Date.now() + 86400000) },
    });
    await prisma.invitation.update({
      where: { id },
      data: { nextAttemptAt: new Date(0) },
    });
    await revokeInvitation(
      account.user.id,
      account.session.id,
      "e2e-private-list",
      id,
    );
    await deliverInvitations(id);
    expect(send).not.toHaveBeenCalled();
  });
});

it("freezes language, list title and inviter for retries and uses sender language for unknown recipients", async () => {
  await revokeInvitation(
    account.user.id,
    account.session.id,
    "e2e-private-list",
    id,
  );
  await prisma.user.update({
    where: { id: "e2e-owner" },
    data: { locale: "fi" },
  });
  const existing = await inviteMember(
    account.user.id,
    account.session.id,
    "e2e-private-list",
    { email: accounts.owner.email, role: "MEMBER" },
    "en",
  );
  const unknown = await inviteMember(
    account.user.id,
    account.session.id,
    "e2e-private-list",
    { email: "unknown-fi@example.test", role: "MEMBER" },
    "fi",
  );
  await prisma.user.update({
    where: { id: "e2e-owner" },
    data: { locale: "en" },
  });
  const send = vi
    .spyOn(mail, "deliverEmail")
    .mockRejectedValueOnce(new Error("temporary outage"))
    .mockResolvedValue({ error: null });
  await prisma.wishlist.update({
    where: { id: "e2e-private-list" },
    data: { title: "Renamed before first delivery" },
  });
  await prisma.user.update({
    where: { id: account.user.id },
    data: { username: "renamed-before-delivery" },
  });
  expect(await deliverInvitations(existing.id)).toEqual({ sent: 0, failed: 1 });
  await prisma.wishlist.update({
    where: { id: "e2e-private-list" },
    data: { title: "Renamed before retry" },
  });
  await prisma.user.update({
    where: { id: account.user.id },
    data: { username: "renamed-before-retry" },
  });
  await prisma.invitation.update({
    where: { id: existing.id },
    data: { nextAttemptAt: new Date(0) },
  });
  await deliverInvitations(existing.id);
  await deliverInvitations(unknown.id);
  expect(send.mock.calls.map((call) => call[1])).toEqual([
    "Kutsusi Wishlistiin: Another person's private list",
    "Kutsusi Wishlistiin: Another person's private list",
    "Kutsusi Wishlistiin: Another person's private list",
  ]);
  expect(send.mock.calls[0][2].props).toMatchObject({
    listTitle: "Another person's private list",
    inviterUsername: "e2e-member",
  });
  expect(send.mock.calls[0][2]).toEqual(send.mock.calls[1][2]);
  expect(JSON.stringify(send.mock.calls[1][2])).toContain(
    `/fi/invitations/${existing.id}`,
  );
  expect(
    (await prisma.invitation.findUniqueOrThrow({ where: { id: unknown.id } }))
      .locale,
  ).toBe("fi");
});

it("keeps legacy invitation payloads unchanged when retrying after migration", async () => {
  await prisma.invitation.update({
    where: { id },
    data: {
      emailListTitle: null,
      emailInviterUsername: null,
      deliveryAttempts: 1,
      firstAttemptAt: new Date(),
    },
  });
  const send = vi
    .spyOn(mail, "deliverEmail")
    .mockResolvedValue({ error: null });
  expect(await deliverInvitations(id)).toEqual({ sent: 1, failed: 0 });
  expect(send.mock.calls[0][1]).toBe("Your Wishlist invitation");
  expect(send.mock.calls[0][2].props).toMatchObject({
    listTitle: undefined,
    inviterUsername: undefined,
  });
  expect(send.mock.calls[0][3]).toBe(`wishlist-invitation/${id}`);
});

it("queues acceptance in the inviter language, delivers once and rejects replay", async () => {
  await prisma.user.update({
    where: { id: account.user.id },
    data: { locale: "fi" },
  });
  const recipient = await authenticate(
    accounts.owner.email,
    accounts.owner.password,
  );
  await acceptInvitation(recipient.user.id, recipient.session.id, id);
  const email = await prisma.accountEmail.findUniqueOrThrow({
    where: { key: `list-invitation-accepted/${id}` },
  });
  expect(email).toMatchObject({
    recipient: accounts.member.email,
    subject: "Kutsusi listalle hyväksyttiin: Another person's private list",
    sentAt: null,
  });
  expect(email.html).toContain("@e2e-owner");
  expect(email.text).toContain("Another person's private list");
  expect(email.html).toContain("/fi/lists/e2e-private-list/sharing");
  await expect(
    acceptInvitation(recipient.user.id, recipient.session.id, id),
  ).rejects.toThrow("unavailable");
  const send = vi
    .spyOn(mail, "deliverRenderedEmail")
    .mockResolvedValue({ error: null });
  await Promise.all([
    deliverAccountEmails(email.id),
    deliverAccountEmails(email.id),
  ]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][1]).toBe(`wishlist-account-email/${email.id}`);
});

it("cancels an acceptance notification if the list is archived", async () => {
  const recipient = await authenticate(
    accounts.owner.email,
    accounts.owner.password,
  );
  await acceptInvitation(recipient.user.id, recipient.session.id, id);
  const email = await prisma.accountEmail.findUniqueOrThrow({
    where: { key: `list-invitation-accepted/${id}` },
  });
  await prisma.wishlist.update({
    where: { id: "e2e-private-list" },
    data: { archivedAt: new Date() },
  });
  const send = vi
    .spyOn(mail, "deliverRenderedEmail")
    .mockResolvedValue({ error: null });
  expect(await deliverAccountEmails(email.id)).toEqual({
    sent: 0,
    failed: 0,
    canceled: 1,
  });
  expect(send).not.toHaveBeenCalled();
});

it.each(["en", "fi"])(
  "delivers the %s acceptance email to the local inbox",
  async (locale) => {
    await prisma.user.update({
      where: { id: account.user.id },
      data: { locale },
    });
    const recipient = await authenticate(
      accounts.owner.email,
      accounts.owner.password,
    );
    await acceptInvitation(recipient.user.id, recipient.session.id, id);
    const email = await prisma.accountEmail.findUniqueOrThrow({
      where: { key: `list-invitation-accepted/${id}` },
    });
    expect(await deliverAccountEmails(email.id)).toEqual({
      sent: 1,
      failed: 0,
      canceled: 0,
    });
    const message = await (
      await fetch(`${testEnvironment.MAILPIT_URL}/api/v1/message/latest`)
    ).json();
    expect(message.Subject).toBe(
      locale === "fi"
        ? "Kutsusi listalle hyväksyttiin: Another person's private list"
        : "Your list invitation was accepted: Another person's private list",
    );
    expect(message.Text).toContain("@e2e-owner");
    expect(message.Text).toContain("Another person's private list");
    expect(message.Text).toContain(`/${locale}/lists/e2e-private-list/sharing`);
  },
);
