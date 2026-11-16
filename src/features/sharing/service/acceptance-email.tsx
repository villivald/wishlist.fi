import { render } from "react-email";
import { emailUrl } from "@/emails/components/layout";
import InvitationAcceptedEmail from "@/emails/sharing/accepted";
import type { Prisma } from "@/generated/prisma/client";
import { createText } from "@/i18n/text";
import { emailSender } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { sharingPath } from "@/paths";

const prefix = "list-invitation-accepted/";

export async function queueInvitationAcceptedEmail(
  tx: Prisma.TransactionClient,
  invitation: {
    id: string;
    inviterId: string;
    wishlistId: string;
    listTitle: string;
  },
  userId: string,
) {
  const recipient = await tx.user.findUniqueOrThrow({
    where: { id: invitation.inviterId },
    select: { email: true, locale: true },
  });
  const actor = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true },
  });
  const t = createText(recipient.locale);
  const email = (
    <InvitationAcceptedEmail
      username={actor.username}
      listTitle={invitation.listTitle}
      locale={recipient.locale}
      url={emailUrl(sharingPath(invitation.wishlistId), recipient.locale)}
    />
  );
  const row = await tx.accountEmail.create({
    data: {
      key: `${prefix}${invitation.id}`,
      userId: invitation.inviterId,
      recipient: recipient.email,
      sender: emailSender(),
      subject: `${t("Your list invitation was accepted")}: ${invitation.listTitle.replace(/[\r\n]+/g, " ")}`,
      html: await render(email),
      text: await render(email, { plainText: true }),
    },
    select: { id: true },
  });
  return row.id;
}

export async function isInvitationAcceptanceEmailCurrent(email: {
  key: string;
  userId: string;
}) {
  if (!email.key.startsWith(prefix)) return true;
  return !!(await prisma.invitation.count({
    where: {
      id: email.key.slice(prefix.length),
      inviterId: email.userId,
      acceptedAt: { not: null },
      wishlist: {
        archivedAt: null,
        memberships: { some: { userId: email.userId, role: "ADMIN" } },
      },
    },
  }));
}
