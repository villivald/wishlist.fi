import { createElement } from "react";
import { render } from "react-email";
import { afterEach, expect, it, vi } from "vitest";
import PremiumEmail from "@/emails/account/premium";
import WelcomeEmail from "@/emails/account/welcome";
import EmailVerification from "@/emails/auth/email-verification";
import EmailPasswordReset from "@/emails/password/email-password-reset";
import GroupEmail from "@/emails/reservation/group";
import WishReservedEmail from "@/emails/reservation/wish-reserved";
import InvitationAcceptedEmail from "@/emails/sharing/accepted";
import InvitationEmail from "@/emails/sharing/invitation";
import { communityLinks } from "@/lib/community-links";

afterEach(() => vi.unstubAllEnvs());

it.each(["en", "fi"])(
  "renders a private %s reservation notice with escaped titles and an ordinary wish link",
  async (locale) => {
    const wishTitle = "<script>Notebook & pen</script>";
    const listTitle = "<img>Birthday wishes</img>";
    const url = `https://wishlist.example/${locale}/lists/example/wishes/example-wish`;
    const email = createElement(WishReservedEmail, {
      locale,
      wishTitle,
      listTitle,
      url,
    });
    const html = await render(email);
    const plain = await render(email, { plainText: true });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;Notebook &amp; pen&lt;/script&gt;");
    expect(html).toContain("&lt;img&gt;Birthday wishes&lt;/img&gt;");
    expect(html).toContain(`href="${url}"`);
    expect(plain).toContain(wishTitle);
    expect(plain).toContain(listTitle);
    expect(plain).toContain(
      locale === "fi"
        ? "Varaajan henkilöllisyys pysyy salassa."
        : "The reserver's identity stays private.",
    );
    expect(plain).not.toContain("/reservations/");
    // Titles belong in the body, below the generic inbox preview.
    expect(html.indexOf("&lt;script&gt;")).toBeGreaterThan(
      html.indexOf("</h1>"),
    );
  },
);

it.each(["en", "fi"])(
  "renders all %s emails with the shared brand, usable links, and a plain-text alternative",
  async (locale) => {
    vi.stubEnv("APP_URL", "https://wishlist.example");
    const emails = [
      createElement(WelcomeEmail, {
        toName: "<script>private name</script>",
        locale,
      }),
      ...(["month", "year", "promo"] as const).map((source) =>
        createElement(PremiumEmail, {
          toName: "Demo",
          locale,
          source,
          startsAt: "2026-10-14T12:00:00Z",
          expiresAt: "2026-11-14T12:00:00Z",
        }),
      ),
      createElement(EmailVerification, {
        toName: "Demo",
        locale,
        code: "ABCDEFGH",
      }),
      createElement(EmailPasswordReset, {
        toName: "Demo",
        locale,
        url: `https://wishlist.example/${locale}/password-reset/token`,
      }),
      createElement(InvitationAcceptedEmail, {
        username: "<script>private name</script>",
        listTitle: "Birthday wishes",
        locale,
        url: `https://wishlist.example/${locale}/lists/example/sharing`,
      }),
      createElement(InvitationEmail, {
        listTitle: "Birthday wishes",
        inviterUsername: "alex",
        locale,
        url: `https://wishlist.example/${locale}/invitations/example`,
      }),
      createElement(WishReservedEmail, {
        locale,
        wishTitle: "<script>Notebook & pen</script>",
        listTitle: "Birthday wishes",
        url: `https://wishlist.example/${locale}/lists/example/wishes/example-wish`,
      }),
      ...(["INVITED", "ACCEPTED"] as const).map((kind) =>
        createElement(GroupEmail, {
          kind,
          actorName: "<script>private name</script>",
          locale,
          url: `https://wishlist.example/${locale}/reservations/example`,
        }),
      ),
    ];
    for (const email of emails) {
      const html = await render(email);
      const plain = await render(email, { plainText: true });
      expect(html).not.toContain("<script>");
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain(`<div lang="${locale}" dir="ltr" role="main">`);
      expect(html).toMatch(/<title>[^<]+<\/title>/);
      expect(html.match(/<title>/g)).toHaveLength(1);
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      expect(html).not.toMatch(/<table(?![^>]*role="presentation")/);
      expect(html).toContain('src="https://wishlist.example/email-brand.png"');
      expect(html).toContain("#faf8f0");
      expect(html).toContain("#ffd803");
      expect(html).toContain(`href="https://wishlist.example/${locale}/about"`);
      expect(plain).not.toContain("<table");
      expect(Buffer.byteLength(html)).toBeLessThan(100_000);
      expect(plain.length).toBeGreaterThan(100);
      expect(plain).not.toContain("Show list");
      expect(html).not.toContain(communityLinks.buyMeACoffee);
      if (email !== emails[0]) {
        expect(html).not.toContain(communityLinks.instagram);
        expect(html).not.toContain(communityLinks.facebook);
      }
    }
    const welcome = await render(emails[0]);
    expect(welcome).not.toContain("<script>");
    expect(welcome).toContain("&lt;script&gt;");
    expect(welcome).toContain(
      `href="https://wishlist.example/${locale}/lists/new"`,
    );
    expect(welcome).toContain(
      `href="https://wishlist.example/${locale}/reservations"`,
    );
    expect(welcome).toContain(`href="${communityLinks.instagram}"`);
    expect(welcome).toContain(`href="${communityLinks.facebook}"`);
    const plainWelcome = await render(emails[0], { plainText: true });
    expect(plainWelcome).toContain(communityLinks.instagram);
    expect(plainWelcome).toContain(communityLinks.facebook);
  },
);

it.each(["en", "fi"])(
  "identifies the list and inviter in %s sharing emails and escapes user content",
  async (locale) => {
    const listTitle = "<script>Birthday & Christmas</script>";
    const inviterUsername = "<script>alex</script>";
    const invitation = createElement(InvitationEmail, {
      locale,
      listTitle,
      inviterUsername,
      url: `https://wishlist.example/${locale}/invitations/example`,
    });
    const acceptance = createElement(InvitationAcceptedEmail, {
      locale,
      listTitle,
      username: "jane",
      url: `https://wishlist.example/${locale}/lists/example/sharing`,
    });
    for (const email of [invitation, acceptance]) {
      const html = await render(email);
      const plain = await render(email, { plainText: true });
      expect(html).not.toContain("<script>");
      expect(html).toContain(
        "&lt;script&gt;Birthday &amp; Christmas&lt;/script&gt;",
      );
      expect(plain).toContain(listTitle);
      expect(plain).toContain(locale === "fi" ? "Lista:" : "List:");
    }
    const plain = await render(invitation, { plainText: true });
    expect(plain).toContain(`@${inviterUsername}`);
    expect(plain).toContain(locale === "fi" ? "Kutsuja:" : "Invited by:");
    const plainAcceptance = await render(acceptance, { plainText: true });
    expect(plainAcceptance).toContain("@jane");
    expect(plainAcceptance).toContain(
      locale === "fi" ? "Jos painike ei toimi" : "If the button does not work",
    );
  },
);

it.each(["en", "fi"])(
  "distinguishes %s paid subscriptions from future promo access",
  async (locale) => {
    vi.stubEnv("APP_URL", "https://wishlist.example");
    const props = {
      toName: "Demo",
      locale,
      startsAt: "2026-11-14T12:00:00Z",
      expiresAt: "2026-12-14T12:00:00Z",
    };
    const promo = await render(
      createElement(PremiumEmail, { ...props, source: "promo" }),
      { plainText: true },
    );
    const paid = await render(
      createElement(PremiumEmail, { ...props, source: "year" }),
      { plainText: true },
    );
    expect(promo).toContain(
      locale === "fi"
        ? "ei uusiudu automaattisesti"
        : "does not renew automatically",
    );
    expect(promo).toContain(
      locale === "fi" ? "voi alkaa myöhemmin" : "may start later",
    );
    expect(promo).not.toContain(
      locale === "fi" ? "Maksu vahvistettu." : "Payment confirmed.",
    );
    const promoHtml = await render(
      createElement(PremiumEmail, { ...props, source: "promo" }),
    );
    const inboxPreview = promoHtml.slice(0, promoHtml.indexOf("<div lang="));
    expect(inboxPreview).toContain(
      locale === "fi"
        ? "Etukoodin käyttöaika ei uusiudu automaattisesti."
        : "Promo access does not renew automatically.",
    );
    expect(inboxPreview).not.toContain(
      locale === "fi" ? "tilausasetuksesi" : "subscription settings",
    );
    expect(paid).toContain(
      locale === "fi" ? "Maksu vahvistettu." : "Payment confirmed.",
    );
    expect(paid).toContain(
      locale === "fi" ? "Hallitse tilausta" : "Manage subscription",
    );
    expect(promo).toContain(
      locale === "fi"
        ? "eikä siirrä sen seuraavaa maksua"
        : "or delay its next payment",
    );
    expect(paid).toContain(
      locale === "fi"
        ? "ei peru tilauksen uusiutumista"
        : "does not cancel renewal",
    );
    for (const message of [promo, paid]) {
      expect(message).toContain(locale === "fi" ? "QR-kortti" : "QR card");
      expect(message).toContain(
        locale === "fi"
          ? "ei anna pääsyä rajatulle listalle"
          : "does not grant access to a private list",
      );
    }
  },
);

it.each(["en", "fi"])(
  "explains %s group consent without leaking names into the preheader",
  async (locale) => {
    const props = {
      locale,
      actorName: "Private Person",
      url: `https://wishlist.example/${locale}/reservations/example`,
    };
    const invited = await render(
      createElement(GroupEmail, { ...props, kind: "INVITED" }),
    );
    const accepted = await render(
      createElement(GroupEmail, { ...props, kind: "ACCEPTED" }),
      { plainText: true },
    );
    expect(invited).toContain(
      locale === "fi"
        ? "jaat nimesi ja käyttäjänimesi ryhmälle"
        : "shares your name and username with the group",
    );
    expect(invited).toContain(
      locale === "fi"
        ? "ei anna pääsyä rajatulle listalle"
        : "does not grant access to a private list",
    );
    expect(invited.indexOf("Private Person")).toBeGreaterThan(
      invited.indexOf("</h1>"),
    );
    expect(accepted).toContain(locale === "fi" ? "hyväksyi" : "accepted");
    expect(accepted).not.toContain(
      locale === "fi" ? "Tarkista kutsu" : "Review invitation",
    );
  },
);

it.each(["en", "fi"])(
  "links back to the %s verification form without putting the code in the URL",
  async (locale) => {
    vi.stubEnv("APP_URL", "https://wishlist.example");
    const html = await render(
      createElement(EmailVerification, {
        toName: "Demo",
        code: "ABCDEFGH",
        locale,
      }),
    );

    expect(html).toContain("ABCDEFGH");
    expect(html).toContain(
      `href="https://wishlist.example/${locale}/email-verification"`,
    );
    const links = Array.from(
      html.matchAll(/href="([^"]+)"/g),
      (match) => match[1],
    );
    expect(links.every((href) => !href.includes("ABCDEFGH"))).toBe(true);
  },
);
it("renders password recovery links", async () => {
  const html = await render(
    createElement(EmailPasswordReset, {
      toName: "Demo",
      url: "https://example.com/password-reset/token",
    }),
  );
  expect(html).toContain('href="https://example.com/password-reset/token"');
});

it("renders Finnish verification and recovery messages without translating user names or secrets", async () => {
  const verification = await render(
    createElement(EmailVerification, {
      toName: "Morning mug",
      code: "ABCDEFGH",
      locale: "fi",
    }),
  );
  expect(verification).toContain('lang="fi"');
  expect(verification).toContain("Morning mug");
  expect(verification).toContain("ABCDEFGH");
  expect(verification).toContain("30 minuutissa");
  expect(verification).not.toContain("This code expires");
  const recovery = await render(
    createElement(EmailPasswordReset, {
      toName: "Demo",
      url: "https://example.com/fi/password-reset/token",
      locale: "fi",
    }),
  );
  expect(recovery).toContain("Palauta salasana");
  expect(recovery).toContain(
    'href="https://example.com/fi/password-reset/token"',
  );
  expect(recovery).toContain("toimii vain kerran");
});
