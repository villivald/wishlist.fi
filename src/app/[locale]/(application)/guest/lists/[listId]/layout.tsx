import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { GuestSession } from "@/features/guest/components/guest-session";
import { GUEST_COOKIE } from "@/features/guest/http";
import { resolveGuestLink } from "@/features/guest/service/access";

export const dynamic = "force-dynamic";

export default async function GuestListLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  const link = await resolveGuestLink(token);
  if (!link || link.wishlistId !== listId) notFound();
  return (
    <GuestSession expiresAt={link.expiresAt.toISOString()}>
      {children}
    </GuestSession>
  );
}
