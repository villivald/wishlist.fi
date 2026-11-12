import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/components/shell.module.css";
import { Link } from "@/i18n/navigation";
import { getText } from "@/i18n/server";
import { createText } from "@/i18n/text";

const contact = <a href="mailto:support@wishlist.fi">support@wishlist.fi</a>;
const creator = <a href="https://www.villivald.com/">villivald</a>;
const operatorIdentity = (t: ReturnType<typeof createText>) => {
  const name = process.env.OPERATOR_LEGAL_NAME?.trim();
  return (
    <p>
      {t("Wishlist is operated personally in Finland.")}
      {name && <> {t("Service operator: {name}.", { name })}</>}
    </p>
  );
};

const information = (
  t: ReturnType<typeof createText>,
): Record<string, { title: string; content: ReactNode }> => ({
  about: {
    title: t("About Wishlist"),
    content: (
      <>
        <p>
          {t(
            "Wishlist is a place to collect things you love and share gift ideas with your people. Create a list, add wishes, and choose who can see them.",
          )}
        </p>
        <h2>
          {t("Designed and built by")} {creator}
        </h2>
        <p>
          {t("Questions, feedback, or something not working? Write to")}{" "}
          {contact}
          {t(
            ". Please do not send passwords, payment details, or private sharing links.",
          )}
        </p>
        <h2>{t("Design credits")}</h2>
        <ul>
          <li>
            {t("Colors inspired by")}{" "}
            <a href="https://www.happyhues.co/palettes/14">Happy Hues</a>.
          </li>
          <li>
            {t(
              "Manrope by the Manrope Project Authors, under the SIL Open Font License.",
            )}
          </li>
          <li>
            {t("Wordmark lettering based on")}{" "}
            <a href="https://github.com/google/fonts/tree/main/ofl/alfaslabone">
              Alfa Slab One
            </a>
            {t(", licensed under")}{" "}
            <a href="https://openfontlicense.org/">SIL Open Font License</a>.
          </li>
          <li>
            {t("Interface icons and the heart favicon from")}{" "}
            <a href="https://lucide.dev/">Lucide</a>.
          </li>
          <li>
            {t("Heading typeface:")}{" "}
            <a href="https://github.com/undercasetype/Fraunces">Fraunces</a>
            {t(", licensed under")}{" "}
            <a href="https://openfontlicense.org/">SIL Open Font License</a>.
          </li>
          <li>
            {t("Unmodified homepage illustrations by")}{" "}
            <a href="https://openmoji.org/">OpenMoji</a>
            {t(", licensed under")}{" "}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/">
              CC BY-SA 4.0
            </a>
            .
          </li>
          <li>
            {t("Botanical illustration from")}{" "}
            <a href="https://publicdomainreview.org/collection/hortus-malabaricus-1678-1693/">
              Hortus Malabaricus (1678–1693)
            </a>
            {t(", via The Public Domain Review. Public domain.")}
          </li>
          <li>
            {t("Botanical and Waves feature artwork from")}{" "}
            <a href="https://publicdomainreview.org/collection/japanese-designs-1902/">
              Shin-Bijutsukai (1902)
            </a>
            {t(", via The Public Domain Image Archive.")}
          </li>
        </ul>
      </>
    ),
  },
  accessibility: {
    title: t("Accessibility"),
    content: (
      <>
        <p>
          {t(
            "Wishlist aims to be usable with a keyboard, enlarged text, assistive technology, and on small screens. WCAG 2.2 AA guides the design.",
          )}
        </p>
        <h2>{t("Using the app")}</h2>
        <ul>
          <li>
            {t(
              "Press Tab to reveal “Skip to content” and move through links and controls.",
            )}
          </li>
          <li>
            {t(
              "Choose a light or dark theme using the theme button in the header.",
            )}
          </li>
          <li>
            {t(
              "Text and layouts support zoom; reduced-motion preferences are respected.",
            )}
          </li>
          <li>
            {t(
              "Images include a description for people using screen readers. When adding or replacing a wish image, its title is used if you leave the image description blank.",
            )}
          </li>
        </ul>
        <h2>{t("Testing and limitations")}</h2>
        <p>
          {t(
            "We test mobile and desktop layouts, keyboard navigation, zoom, and automated accessibility checks. A full screen-reader and browser review is still needed; we do not claim full accessibility conformance. Image descriptions are written by the person uploading them.",
          )}
        </p>
        <h2>{t("Report a barrier")}</h2>
        <p>
          {t("Send an email to")} {contact}.
        </p>
        <p>
          {t(
            "Tell us which page you were on, what you were trying to do, and which browser or assistive technology you use. Do not include private list links or other people’s personal information.",
          )}
        </p>
      </>
    ),
  },
  privacy: {
    title: t("Privacy and your data"),
    content: (
      <>
        {operatorIdentity(t)}
        <p>
          {t(
            "This notice explains how Wishlist handles personal data. For privacy questions or requests about your data, email",
          )}{" "}
          {contact}.
        </p>
        <h2>{t("What others can see")}</h2>
        <ul>
          <li>
            {t(
              "Lists set to Visible · Anyone and their available wishes appear in Browse. Anyone can view them without an account.",
            )}
          </li>
          <li>
            {t(
              "When you own a list visible to anyone, your display name (or username), avatar, and “About you” appear in People. People can find you by display name or username. Your email is not shown.",
            )}
          </li>
          <li>
            {t(
              "Lists set to Visible · People with access require membership or an active guest link. Guest links allow viewing without an account until they expire or are revoked.",
            )}
          </li>
          <li>
            {t(
              "Hidden lists and hidden, fulfilled, or reserved wishes do not appear in Browse. Reserved wishes are visible to the organizer, accepted group participants, and list admins. Group members share their names and usernames with each other; list admins do not see the roster unless they join.",
            )}
          </li>
        </ul>
        <h2>{t("What the app stores")}</h2>
        <p>
          {t(
            "Account information, a password hash, session and recovery records, lists, wishes, uploaded images, memberships, invitations, reservations, and Premium records support the features you use. Account emails, group invitations, and acceptance notifications are delivered through the configured email service. The app does not store payment-card details; checkout is handled by Paddle when enabled.",
          )}
        </p>
        <h2>{t("Cookies and preferences")}</h2>
        <p>
          {t(
            "If you choose Continue with Google, Google authenticates you and shares your account identifier and email with Wishlist. We store the linked identifier and email, not your Google password or Google access tokens. A short-lived security cookie protects the sign-in process. Email and password remain available as an alternative.",
          )}
        </p>
        <p>
          {t(
            "Signup, password recovery, and verification-email requests use Cloudflare Turnstile to help prevent automated abuse. Cloudflare processes browser and device signals for this security check.",
          )}
        </p>
        <p>
          {t(
            "Cookies keep you signed in and remember access granted by a guest link. Your theme preference is stored in your browser. Optional performance measurements use no visitor identifiers.",
          )}
        </p>
        <h2>{t("Your controls")}</h2>
        <p>
          {t(
            "Edit your profile or delete your account in Account. Use each list’s settings to hide it or manage guest links, and its edit pages to remove images. Hiding a list ends its active reservations.",
          )}
        </p>
        <p>
          {t(
            "Account deletion removes sign-in access and your profile. Shared lists may transfer to another admin or be archived; wishes you added can remain without your name. Payment records needed to resolve payments can remain without a linked profile.",
          )}
        </p>
        <p>
          {t(
            "Account data is kept while your account exists. Shared content and reservation history can remain with a list after an account is deleted. The app does not automatically purge archived lists or all historical records after a fixed period.",
          )}
        </p>
        <h2>{t("Why we process data")}</h2>
        <p>
          {t(
            "We process account, sharing and subscription data to provide the service you request under our contract with you. Security and abuse prevention support our legitimate interest in protecting the service and its users. Some records are retained to meet legal obligations or resolve payment issues. Contact support about the basis for a particular use of your data.",
          )}
        </p>
        <h2>{t("Service providers and payments")}</h2>
        <p>
          {t(
            "Vercel hosts the app and uploaded images; Neon stores app data; Resend delivers account emails; Inngest runs background work; Cloudflare Turnstile helps prevent abuse. Support correspondence is handled through the operator’s email service. These services process the data needed for their functions.",
          )}
        </p>
        <p>
          {t(
            "Paddle processes paid checkout, customer and payment records as merchant of record under its own privacy notice. Wishlist stores provider identifiers and subscription/access records, not payment-card details.",
          )}
        </p>
        <ul>
          <li>
            <a href="https://vercel.com/legal/privacy-notice">
              {t("Vercel privacy notice")}
            </a>
          </li>
          <li>
            <a href="https://neon.com/privacy-policy">
              {t("Neon privacy notice")}
            </a>
          </li>
          <li>
            <a href="https://resend.com/legal/privacy-policy">
              {t("Resend privacy notice")}
            </a>
          </li>
          <li>
            <a href="https://www.inngest.com/privacy">
              {t("Inngest privacy notice")}
            </a>
          </li>
          <li>
            <a href="https://www.cloudflare.com/privacypolicy/">
              {t("Cloudflare privacy notice")}
            </a>
          </li>
          <li>
            <a href="https://www.paddle.com/legal/privacy">
              {t("Paddle privacy notice")}
            </a>
          </li>
          <li>
            <a href="https://policies.google.com/privacy">
              {t("Google privacy notice")}
            </a>
          </li>
        </ul>
        <p>
          {t(
            "Providers can process data outside the European Economic Area. Their notices describe processing locations and international transfers. You can ask support about recipients and the safeguards applicable to your data.",
          )}
        </p>
        <h2>{t("Support, backups and billing history")}</h2>
        <p>
          {t(
            "Encrypted manual backups are kept for up to 30 days, including off-device copies. Data deleted from the live app may remain in a backup until that copy expires. Resolved support correspondence is deleted after 90 days unless longer retention is required by law.",
          )}
        </p>
        <p>
          {t(
            "Unlinked billing identifiers and recovery records can remain after account deletion to settle payments, cancellations, refunds and related obligations. The app has no automatic fixed-period purge for all billing history. Provider logs follow their own retention rules. Contact support about records that are no longer needed.",
          )}
        </p>
        <h2>{t("Your data-protection rights")}</h2>
        <p>
          {t(
            "You can request access, correction, erasure, restriction, portability or object to processing where applicable. We may verify your identity and explain any limits that apply, including records required by law. You can complain to Finland’s Office of the Data Protection Ombudsman.",
          )}
        </p>
        <p>
          <a href="https://tietosuoja.fi/en/home">
            {t("Office of the Data Protection Ombudsman")}
          </a>
        </p>
      </>
    ),
  },
  terms: {
    title: t("Terms of use"),
    content: (
      <>
        {operatorIdentity(t)}
        <p>
          {t("These terms cover your use of Wishlist. Contact")} {contact}{" "}
          {t("with questions.")}
        </p>
        <h2>{t("Use it thoughtfully")}</h2>
        <ul>
          <li>
            {t(
              "Only upload content you are allowed to share. Do not share sensitive personal information about yourself or others.",
            )}
          </li>
          <li>
            {t(
              "Keep your password and private sharing links secure. Do not try to bypass access controls or interfere with other users.",
            )}
          </li>
          <li>
            {t(
              "Check who can see your list before choosing Show list. Lists set to Anyone can be viewed without an account and found in Browse.",
            )}
          </li>
        </ul>
        <h2>{t("Wishes and reservations")}</h2>
        <p>
          {t(
            "A reservation helps people coordinate a gift. It does not buy an item, guarantee availability, or create a transaction between users. Product links lead to external websites whose prices and terms may change.",
          )}
        </p>
        <h2>{t("Premium subscriptions")}</h2>
        <p>
          {t(
            "Free features are available without a paid subscription. When paid subscriptions are enabled, Premium is offered monthly or annually through Paddle. The pricing page and checkout show the price, billing interval and applicable taxes before payment. Subscriptions renew automatically until canceled. Paid access follows confirmed payment; promo access follows its stated duration.",
          )}
        </p>
        <p>
          <Link href="/premium">{t("Free and Premium")}</Link>
        </p>
        {process.env.PADDLE_ENVIRONMENT === "sandbox" && (
          <p className={styles.notice}>
            {t(
              "Sandbox · Use Paddle test payment details only. No real money is charged.",
            )}
          </p>
        )}
        <p>
          {t(
            "Use Manage subscription in Your plan or the link in your Paddle receipt to cancel renewal. Your paid access lasts until the end of the paid period. Refund and withdrawal requests follow Paddle’s Buyer Terms and Refund Policy, including mandatory consumer rights.",
          )}
        </p>
        <p>
          <Link href="/refunds">{t("Refunds and cancellations")}</Link> ·{" "}
          <a href="https://www.paddle.com/legal/buyer-terms">
            {t("Paddle Buyer Terms")}
          </a>
        </p>
        <h2>{t("Deleting your account")}</h2>
        <p>
          {t(
            "You can delete your account in settings. Review the deletion summary to see what happens to shared lists and reservations before confirming.",
          )}
        </p>
        <p>
          {t(
            "Account deletion does not automatically request a refund. Cancellation is processed through Paddle; contact support if a payment or cancellation remains unresolved.",
          )}
        </p>
        <h2>{t("Availability and your rights")}</h2>
        <p>
          {t(
            "Features and availability can change, and maintenance or faults can interrupt access. Keep your own copy of information you need. Contact support if the service does not work as described. These terms do not limit your mandatory consumer rights.",
          )}
        </p>
      </>
    ),
  },
  refunds: {
    title: t("Refunds and cancellations"),
    content: (
      <>
        <p>
          {t(
            "For paid Premium purchases, Paddle is our merchant of record and handles checkout, payments and receipts.",
          )}
        </p>
        <p>
          <a href="https://www.paddle.com/legal/buyer-terms">
            {t("Paddle Buyer Terms")}
          </a>
        </p>
        {process.env.PADDLE_ENVIRONMENT === "sandbox" && (
          <p className={styles.notice}>
            {t(
              "Sandbox · Use Paddle test payment details only. No real money is charged.",
            )}
          </p>
        )}
        <h2>{t("Cancel renewal")}</h2>
        <p>
          {t(
            "Open Your plan and choose Manage subscription, or use the link in your Paddle receipt. Canceling renewal stops future subscription charges; paid access lasts until the end of the paid period.",
          )}
        </p>
        <p>
          <Link href="/account/plan">{t("Your plan and promo codes")}</Link>
        </p>
        <h2>{t("Request a refund or withdrawal")}</h2>
        <p>
          {t(
            "Use the support link in your Paddle receipt or visit paddle.net. Eligibility and deadlines follow Paddle’s Refund Policy, including country-specific consumer rights. Canceling renewal does not automatically request a refund.",
          )}
        </p>
        <ul>
          <li>
            <a href="https://paddle.net/">{t("Request a refund")}</a>
          </li>
          <li>
            <a href="https://www.paddle.com/legal/refund-policy">
              {t("Paddle Refund Policy")}
            </a>
          </li>
        </ul>
        <p>
          {t(
            "A full approved refund removes the Premium access covered by that payment. Other paid or promotional access remains. To stop future charges, also check that renewal is canceled.",
          )}
        </p>
        <p>
          {t("Nothing on this page limits your mandatory consumer rights.")}
        </p>
        <h2>{t("Questions or a problem?")}</h2>
        <p>
          {t("For an app problem or help with a charge, email")} {contact}.{" "}
          {t(
            "Include your receipt reference if available. Do not send payment-card details.",
          )}
        </p>
      </>
    ),
  },
  "site-map": {
    title: t("Site map"),
    content: (
      <>
        <h2>{t("Explore")}</h2>
        <ul>
          <li>
            <Link href="/">{t("Welcome")}</Link>
          </li>
          <li>
            <Link href="/browse">{t("Public wishlists")}</Link>
          </li>
          <li>
            <Link href="/browse?view=wishes">{t("Available wishes")}</Link>
          </li>
          <li>
            <Link href="/browse?view=users">{t("People")}</Link>
          </li>
        </ul>
        <p>
          <Link href="/premium">{t("Free and Premium")}</Link>
        </p>
        <h2>{t("Your space")}</h2>
        <ul>
          <li>
            <Link href="/lists">{t("Your wishlists")}</Link>
          </li>
          <li>
            <Link href="/lists?shared=1">{t("Lists shared with you")}</Link>
          </li>
          <li>
            <Link href="/reservations">{t("Your reservations")}</Link>
          </li>
          <li>
            <Link href="/favorites">{t("Favorites")}</Link>
          </li>
          <li>
            <Link href="/account/profile">{t("Profile and settings")}</Link>
          </li>
          <li>
            <Link href="/sign-in">{t("Sign in")}</Link>
          </li>
          <li>
            <Link href="/sign-up">{t("Create an account")}</Link>
          </li>
        </ul>
        <h2>{t("Information")}</h2>
        <ul>
          <li>
            <Link href="/about">{t("About and contact")}</Link>
          </li>
          <li>
            <Link href="/accessibility">{t("Accessibility")}</Link>
          </li>
          <li>
            <Link href="/privacy">{t("Privacy")}</Link>
          </li>
          <li>
            <Link href="/terms">{t("Terms of use")}</Link>
          </li>
          <li>
            <Link href="/refunds">{t("Refunds and cancellations")}</Link>
          </li>
        </ul>
      </>
    ),
  },
});

const readInformation = (name: string, t: ReturnType<typeof createText>) => {
  const pages = information(t);
  if (!Object.hasOwn(pages, name)) notFound();
  return pages[name];
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ information: string }>;
}): Promise<Metadata> {
  const page = readInformation((await params).information, await getText());
  return { title: page.title, robots: { index: false, follow: false } };
}

export default async function InformationPage({
  params,
}: {
  params: Promise<{ information: string }>;
}) {
  const page = readInformation((await params).information, await getText());
  return (
    <article className={styles["information-page"]}>
      <h1>{page.title}</h1>
      {page.content}
    </article>
  );
}
