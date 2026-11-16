import { render } from "react-email";
import { emailUrl } from "@/emails/components/layout";
import GroupEmail from "@/emails/reservation/group";
import { readableLists } from "@/features/wishlist/service/access";
import type { GroupEmailKind, Prisma } from "@/generated/prisma/client";
import { createText } from "@/i18n/text";
import { emailSender } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { reservationGroupPath } from "@/paths";

export async function queueGroupEmail(
  tx: Prisma.TransactionClient,
  input: {
    participantId: string;
    reservationId: string;
    recipientId: string;
    actorId: string;
    kind: GroupEmailKind;
  },
) {
  const key = `group/${input.kind}/${input.participantId}`;
  if (
    await tx.accountEmail.findUnique({ where: { key }, select: { id: true } })
  )
    return;
  const recipient = await tx.user.findUniqueOrThrow({
    where: { id: input.recipientId },
    select: { email: true, locale: true },
  });
  const actor = await tx.user.findUniqueOrThrow({
    where: { id: input.actorId },
    select: { name: true, username: true },
  });
  const t = createText(recipient.locale);
  const email = (
    <GroupEmail
      kind={input.kind}
      actorName={
        actor.name ? `${actor.name} (@${actor.username})` : `@${actor.username}`
      }
      locale={recipient.locale}
      url={emailUrl(
        reservationGroupPath(input.reservationId),
        recipient.locale,
      )}
    />
  );
  // Queue with the mutation; identical rendered payloads make retries safe.
  const emailRecord = await tx.accountEmail.create({
    data: {
      key,
      userId: input.recipientId,
      recipient: recipient.email,
      sender: emailSender(),
      groupParticipantId: input.participantId,
      groupEmailKind: input.kind,
      subject: t(
        input.kind === "INVITED"
          ? "You're invited to a group reservation"
          : "Someone joined your group reservation",
      ),
      html: await render(email),
      text: await render(email, { plainText: true }),
    },
    select: { id: true },
  });
  return emailRecord.id;
}

export async function isGroupEmailCurrent(email: {
  groupParticipantId: string | null;
  groupEmailKind: GroupEmailKind | null;
  userId: string;
}) {
  if (!email.groupParticipantId) return email.groupEmailKind === null;
  if (!email.groupEmailKind) return false;
  const invited = email.groupEmailKind === "INVITED";
  const person = await prisma.reservationParticipant.findFirst({
    where: {
      id: email.groupParticipantId,
      status: invited ? "PENDING" : "ACCEPTED",
      ...(invited
        ? { userId: email.userId, expiresAt: { gt: new Date() } }
        : {}),
      user: { emailVerified: true },
      reservation: {
        groupEnabled: true,
        endedAt: null,
        ...(!invited ? { userId: email.userId } : {}),
        user: { emailVerified: true },
        wish: {
          hidden: false,
          fulfilledAt: null,
          wishlist: {
            ...readableLists(email.userId),
            publication: "PUBLISHED",
            ...(invited ? { reservationsEnabled: true } : {}),
          },
        },
      },
    },
    select: {
      userId: true,
      inviterId: true,
      reservation: {
        select: { userId: true, wish: { select: { wishlistId: true } } },
      },
    },
  });
  if (!person || (invited && person.inviterId !== person.reservation.userId))
    return false;
  // Recheck both sides' access; an email never restores a stale invitation.
  const listId = person.reservation.wish.wishlistId;
  for (const userId of new Set([person.userId, person.reservation.userId])) {
    if (
      !(await prisma.wishlist.count({
        where: {
          id: listId,
          ...readableLists(userId),
          publication: "PUBLISHED",
        },
      }))
    )
      return false;
  }
  return true;
}
