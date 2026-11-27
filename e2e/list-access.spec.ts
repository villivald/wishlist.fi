import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { accounts, resetFixtures, testPrisma } from "./seed";

const listId = "e2e-access-proposal";
const title = "Birthday wishes with clear access";
const path = (locale = "en") => `/${locale}/lists/${listId}`;
const signIn = async (page: Page, account = accounts.owner) => {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/lists$/);
};

test.beforeEach(async () => {
  await resetFixtures();
  const db = testPrisma();
  try {
    await db.premiumGrant.create({
      data: {
        userId: "e2e-owner",
        startsAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await db.wishlist.create({
      data: {
        id: listId,
        title,
        ownerId: "e2e-owner",
        publication: "DRAFT",
        visibility: "PUBLIC",
        memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
        guestLinks: {
          create: {
            label: "Family link",
            tokenHash: "d".repeat(64),
            expiresAt: new Date(Date.now() + 86400000),
          },
        },
        wishes: { create: { id: "e2e-access-wish", title: "A book" } },
      },
    });
  } finally {
    await db.$disconnect();
  }
});

test("independent pagers return to their own section and keep the other page", async ({
  page,
}) => {
  await signIn(page);
  for (const { url, pagers } of [
    {
      url: `${path()}/sharing?members=3&invitations=4`,
      pagers: [
        ["Member pages", "members", "invitations", "members-heading"],
        ["Invitation pages", "invitations", "members", "invitations-heading"],
      ],
    },
    {
      url: "/en/reservations?page=3&invitationsPage=4",
      pagers: [
        ["Reservation pages", "page", "invitationsPage", "reservation-results"],
        [
          "Group invitation pages",
          "invitationsPage",
          "page",
          "group-invitations-heading",
        ],
      ],
    },
  ]) {
    for (const [label, key, other, heading] of pagers) {
      await page.goto(url);
      const previousOther = new URL(page.url()).searchParams.get(other);
      await page
        .getByRole("navigation", { name: label })
        .getByRole("link", { name: "Back to first page" })
        .click();
      await expect(page).toHaveURL(
        ({ searchParams, hash }) =>
          searchParams.get(key) === "1" &&
          searchParams.get(other) === previousOther &&
          hash === `#${heading}`,
      );
      await expect(
        page.locator(`#${heading}`).filter({ visible: true }),
      ).toBeInViewport();
      if (heading === "members-heading") {
        await page.screenshot({
          path: test.info().outputPath("sharing-returns-to-members.png"),
        });
      }
    }
  }
});

for (const locale of ["en", "fi"] as const) {
  const fi = locale === "fi";
  test(`${locale}: sharing privately while inviting grants access after acceptance and stays out of public responses`, async ({
    page,
    browser,
    request,
  }, info) => {
    await signIn(page);
    await page.goto(`${path(locale)}/sharing`);
    const hidden = page.getByRole("radio", {
      name: fi ? "Piilotettu" : "Hidden",
      exact: true,
    });
    await expect(hidden).toBeChecked();
    const invite = page.getByRole("region", {
      name: fi ? "Kutsu henkilöitä" : "Invite people",
      exact: true,
    });
    await invite
      .getByRole("textbox", {
        name: fi ? "Kutsuttavan sähköposti" : "Invitation email",
        exact: true,
      })
      .fill(accounts.member.email);
    const share = invite.getByRole("button", {
      name: fi ? "Jaa yksityisesti ja kutsu" : "Share privately & invite",
      exact: true,
    });
    await expect(share).toBeVisible();
    await expect(invite).toContainText(
      fi ? "Voimassa olevia vieraslinkkejä: 1" : "Active guest links: 1",
    );
    await expect(invite).toContainText(
      fi ? "kaikki nykyiset" : "all existing accepted members",
    );
    for (const dark of [false, true]) {
      await page.setViewportSize({ width: 320, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate((dark) => {
        document.documentElement.classList.toggle("dark", dark);
        document.documentElement.style.fontSize = "200%";
      }, dark);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page }).include("main").analyze()).violations,
      ).toEqual([]);
      await invite.screenshot({
        path: info.outputPath(
          `hidden-invite-${locale}-${dark ? "dark" : "light"}-320-200.png`,
        ),
      });
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await share.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status", {
        name: fi ? "Tallennusvahvistus" : "Save confirmation",
      }),
    ).toContainText(fi ? "Lista jaettu yksityisesti" : "List shared privately");
    await expect(
      page.getByRole("radio", {
        name: fi ? "Kutsutut henkilöt" : "Invited people",
        exact: true,
      }),
    ).toBeChecked();
    await expect(
      invite.getByRole("button", {
        name: fi ? "Lähetä kutsu" : "Send invitation",
        exact: true,
      }),
    ).toBeVisible();
    expect(await (await request.get(path())).text()).not.toContain(title);
    const db = testPrisma();
    let invitationId;
    try {
      expect(
        await db.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toMatchObject({ publication: "PUBLISHED", visibility: "PRIVATE" });
      invitationId = (
        await db.invitation.findFirstOrThrow({ where: { wishlistId: listId } })
      ).id;
    } finally {
      await db.$disconnect();
    }
    const member = await browser.newPage();
    try {
      await signIn(member, accounts.member);
      await member.goto(`/${locale}/invitations/${invitationId}`);
      await member.getByRole("checkbox").check();
      await member
        .getByRole("button", {
          name: fi ? "Hyväksy kutsu" : "Accept invitation",
          exact: true,
        })
        .click();
      await expect(member).toHaveURL(/\/lists\?shared=1/);
      await member.goto(path(locale));
      await expect(
        member.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        member.getByRole("link", {
          name: fi ? "Listan käyttöoikeudet" : "List access",
          exact: true,
        }),
      ).toHaveCount(0);
    } finally {
      await member.close();
    }
  });

  for (const role of ["MEMBER", "ADMIN"] as const) {
    test(`${locale}: inviting a ${role} can keep the list hidden with an accurate access explanation`, async ({
      page,
      browser,
    }) => {
      await signIn(page);
      await page.goto(`${path(locale)}/sharing`);
      await page
        .getByRole("textbox", {
          name: fi ? "Kutsuttavan sähköposti" : "Invitation email",
          exact: true,
        })
        .fill(accounts.member.email);
      await page
        .getByRole("combobox", {
          name: fi ? "Kutsutun rooli" : "Invitation role",
          exact: true,
        })
        .selectOption(role);
      if (role === "MEMBER") {
        await page
          .getByRole("radio", {
            name: fi ? "Pidä toistaiseksi piilotettuna" : "Keep hidden for now",
            exact: true,
          })
          .check();
      } else {
        await expect(
          page.getByRole("radio", {
            name: fi ? "Pidä toistaiseksi piilotettuna" : "Keep hidden for now",
            exact: true,
          }),
        ).toHaveCount(0);
      }
      await page
        .getByRole("button", {
          name:
            role === "ADMIN"
              ? fi
                ? "Kutsu ylläpitäjäksi"
                : "Invite as admin"
              : fi
                ? "Kutsu ja pidä piilotettuna"
                : "Invite & keep hidden",
          exact: true,
        })
        .click();
      await expect(page.getByRole("status")).toContainText(
        fi ? "Kutsu luotu" : "Invitation created",
      );
      await expect(
        page.getByRole("radio", {
          name: fi ? "Piilotettu" : "Hidden",
          exact: true,
        }),
      ).toBeChecked();
      const db = testPrisma();
      let invitationId;
      try {
        expect(
          await db.wishlist.findUniqueOrThrow({ where: { id: listId } }),
        ).toMatchObject({ publication: "DRAFT", visibility: "PUBLIC" });
        invitationId = (
          await db.invitation.findFirstOrThrow({
            where: { wishlistId: listId },
          })
        ).id;
      } finally {
        await db.$disconnect();
      }
      const member = await browser.newPage();
      try {
        await signIn(member, accounts.member);
        await member.goto(`/${locale}/invitations/${invitationId}`);
        await expect(member.getByRole("main")).toContainText(
          role === "MEMBER"
            ? fi
              ? "Lista on piilotettu. Voit hyväksyä jäsenkutsun nyt"
              : "This list is hidden. You can accept as a member now"
            : fi
              ? "voit avata listan myös piilotettuna"
              : "you can open this list even when hidden",
        );
        await member.getByRole("checkbox").check();
        await member
          .getByRole("button", {
            name: fi ? "Hyväksy kutsu" : "Accept invitation",
            exact: true,
          })
          .click();
        await expect(member).toHaveURL(/\/lists\?shared=1/);
        await member.goto(path(locale));
        const heading = member.getByRole("heading", {
          name: title,
          exact: true,
        });
        if (role === "ADMIN") await expect(heading).toBeVisible();
        else await expect(heading).toHaveCount(0);
        await page.reload();
        const card = page.getByRole("listitem").filter({
          has: page.getByRole("heading", { name: "e2e-member", exact: true }),
        });
        await expect(card).toContainText(
          role === "ADMIN"
            ? fi
              ? "Voi katsella ja muokata"
              : "Can view and edit"
            : fi
              ? "Ei voi katsella piilotettua listaa"
              : "Viewing blocked while hidden",
        );
      } finally {
        await member.close();
      }
    });
  }

  test(`${locale}: stale invitations cannot change newer access settings`, async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`${path(locale)}/sharing`);
    await page
      .getByRole("textbox", {
        name: fi ? "Kutsuttavan sähköposti" : "Invitation email",
        exact: true,
      })
      .fill(accounts.member.email);
    const db = testPrisma();
    try {
      await db.wishlist.update({
        where: { id: listId },
        data: { publication: "PUBLISHED", visibility: "PUBLIC" },
      });
      await page
        .getByRole("button", {
          name: fi ? "Jaa yksityisesti ja kutsu" : "Share privately & invite",
          exact: true,
        })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        fi ? "Listan käyttöoikeudet ovat muuttuneet" : "List access changed",
      );
      expect(await db.invitation.count({ where: { wishlistId: listId } })).toBe(
        0,
      );
      expect(
        await db.wishlist.findUniqueOrThrow({ where: { id: listId } }),
      ).toMatchObject({ publication: "PUBLISHED", visibility: "PUBLIC" });
    } finally {
      await db.$disconnect();
    }
  });

  test(`${locale}: access settings review new reservations before hiding and cancellation preserves access`, async ({
    page,
  }) => {
    const db = testPrisma();
    try {
      await db.wishlist.update({
        where: { id: listId },
        data: { publication: "PUBLISHED" },
      });
      await db.reservation.create({
        data: {
          id: "e2e-access-reservation",
          userId: "e2e-member",
          wishId: "e2e-access-wish",
        },
      });
      await signIn(page);
      await page.goto(`${path(locale)}/sharing`);
      const region = page.getByRole("region", {
        name: fi ? "Kuka näkee tämän listan?" : "Who can view this list?",
        exact: true,
      });
      await region
        .getByRole("radio", { name: fi ? "Piilotettu" : "Hidden", exact: true })
        .check();
      await region.getByRole("checkbox").check();
      const hide = region.getByRole("button", {
        name: fi ? "Piilota lista" : "Hide list",
        exact: true,
      });
      await hide.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(hide).toBeFocused();
      expect(
        (await db.wishlist.findUniqueOrThrow({ where: { id: listId } }))
          .publication,
      ).toBe("PUBLISHED");
      await hide.click();
      await expect(dialog).toBeVisible();
      await db.wish.create({
        data: {
          id: "e2e-access-new-wish",
          title: "A new reservation",
          wishlistId: listId,
          reservations: { create: { userId: "e2e-member" } },
        },
      });
      const confirm = dialog.getByRole("button", {
        name: fi
          ? "Piilota lista ja päätä varaukset"
          : "Hide list and end reservations",
        exact: true,
      });
      await confirm.click();
      await expect(
        dialog.getByText("A new reservation", { exact: true }),
      ).toBeVisible();
      expect(
        await db.reservation.count({
          where: { wish: { wishlistId: listId }, endedAt: null },
        }),
      ).toBe(2);
      await confirm.click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("status")).toContainText(
        fi ? "Listan käyttöoikeudet päivitetty" : "List access updated",
      );
      expect(
        await db.reservation.count({
          where: { wish: { wishlistId: listId }, endedAt: null },
        }),
      ).toBe(0);
    } finally {
      await db.$disconnect();
    }
  });
}
