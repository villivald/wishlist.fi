import type { Metadata } from "next";
import { OpenGuestLink } from "@/features/guest/components/open-guest-link";
import { getText } from "@/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Guest link"),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default function GuestEntryPage() {
  return <OpenGuestLink />;
}
