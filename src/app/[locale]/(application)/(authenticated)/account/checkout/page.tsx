import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import styles from "@/components/shell.module.css";
import { getAuthOrRedirect } from "@/features/auth/queries/get-auth-or-redirect";
import billing from "@/features/billing/components/billing.module.css";
import { PaddleCheckout } from "@/features/billing/components/paddle-checkout";
import { checkoutDetails } from "@/features/billing/service/checkout";
import { plans } from "@/features/billing/service/config";
import { getText } from "@/i18n/server";
import { redirect } from "@/i18n/server-navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  return {
    title: t("Premium checkout"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; _ptxn?: string }>;
}) {
  const t = await getText();

  const { user } = await getAuthOrRedirect();
  const query = await searchParams;
  let checkout;
  try {
    checkout = await checkoutDetails(user.id, query.id, query._ptxn);
  } catch {
    return (
      <section className={styles.editor}>
        <h1>{t("Checkout unavailable")}</h1>
        <p>
          {t(
            "Checkout could not be loaded. Return to your plan and try again shortly.",
          )}
        </p>
        <BackLink href="/account/plan">{t("Back to your plan")}</BackLink>
      </section>
    );
  }
  if (!checkout) notFound();
  if (checkout.state === "return")
    return redirect("/account/plan?checkout=returned");

  return (
    <section className={billing.checkout}>
      <BackLink href="/account/plan">{t("Back to your plan")}</BackLink>
      <h1>{t("Premium checkout")}</h1>
      {checkout.environment === "sandbox" && (
        <p className={styles.notice}>
          {t(
            "Sandbox · Use Paddle test payment details only. No real money is charged.",
          )}
        </p>
      )}
      <p>
        {t.message(plans[checkout.interval].display)}
        {t(", including applicable tax. Renews automatically until canceled.")}
      </p>
      <p className={styles.muted}>
        {t(
          "Cancel renewal in Paddle at any time. Your paid access lasts until the end of the paid period.",
        )}
      </p>
      <PaddleCheckout
        transactionId={checkout.transactionId}
        clientToken={checkout.clientToken}
        environment={checkout.environment}
        customerId={checkout.customerId}
      />
      <p>
        {t(
          "After payment, we’ll check its status when you return to Your plan. If your subscription does not appear, select Refresh billing.",
        )}
      </p>
    </section>
  );
}
