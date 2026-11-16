import { render } from "react-email";
import { emailUrl } from "@/emails/components/layout";
import WishReservedEmail from "@/emails/reservation/wish-reserved";
import { manageableLists } from "@/features/wishlist/service/access";
import type { Prisma } from "@/generated/prisma/client";
import { createText } from "@/i18n/text";
import { emailSender } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { wishPath } from "@/paths";

const prefix = "wish-reserved/";

export async function queueWishReservedEmail(
  tx: Prisma.TransactionClient,
  reservation: { id: string; wishId: string; userId: string },
) {
  const wish = await tx.wish.findUniqueOrThrow({
    where: { id: reservation.wishId },
    select: {
      title: true,
      wishlistId: true,
      wishlist: {
        select: {
          title: true,
          owner: {
            select: {
              id: true,
              email: true,
              emailVerified: true,
              locale: true,
            },
          },
        },
      },
    },
  });
  const owner = wish.wishlist.owner;
  if (!owner?.emailVerified || owner.id === reservation.userId) return;
  const key = `${prefix}${reservation.id}`;
  const existing = await tx.accountEmail.findUnique({
    where: { key },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Only wish/list details enter the immutable message. Never load or include
  // the reserver's profile, contact details, group roster or reservation URL.
  const email = (
    <WishReservedEmail
      wishTitle={wish.title}
      listTitle={wish.wishlist.title}
      locale={owner.locale}
      url={emailUrl(
        wishPath(wish.wishlistId, reservation.wishId),
        owner.locale,
      )}
    />
  );
  const row = await tx.accountEmail.create({
    data: {
      key,
      userId: owner.id,
      recipient: owner.email,
      sender: emailSender(),
      subject: createText(owner.locale)("Your wish was reserved"),
      html: await render(email),
      text: await render(email, { plainText: true }),
    },
    select: { id: true },
  });
  return row.id;
}

export async function isWishReservedEmailCurrent(email: {
  key: string;
  userId: string;
}) {
  if (!email.key.startsWith(prefix)) return true;
  return !!(await prisma.reservation.count({
    where: {
      id: email.key.slice(prefix.length),
      endedAt: null,
      userId: { not: email.userId },
      user: { emailVerified: true },
      wish: {
        hidden: false,
        fulfilledAt: null,
        wishlist: {
          ...manageableLists(email.userId),
          ownerId: email.userId,
          publication: "PUBLISHED",
        },
      },
    },
  }));
}
