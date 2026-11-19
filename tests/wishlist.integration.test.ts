import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import { listThemeIds } from "@/features/premium/themes";
import { cancelReservation } from "@/features/reservation/service/reservations";
import {
  changePublication,
  createList,
  deleteList,
  updateList,
} from "@/features/wishlist/actions/manage-list";
import {
  createWishlist,
  deleteWishlist,
  readManagedWishlist,
  readMyWishlists,
  readWishlist,
  setWishlistPublication,
  updateWishlist,
} from "@/features/wishlist/service/lists";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase } from "../e2e/environment";
import { resetFixtures } from "../e2e/seed";

const auth = vi.hoisted(() => ({ userId: "e2e-owner" }));

vi.mock("@/features/auth/queries/get-auth-or-redirect", () => ({
  getAuthOrRedirect: async () => ({ user: { id: auth.userId } }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const input = {
  title: "Birthday ideas",
  description: "A few things I love.",
  reservationsEnabled: false,
};

assertTestDatabase(process.env);

beforeEach(async () => {
  auth.userId = "e2e-owner";
  await resetFixtures();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("wishlist management and authorization", () => {
  it("requires an authorized reservation review even for a direct hide submission", async () => {
    const list = await createWishlist("e2e-owner", {
      ...input,
      reservationsEnabled: true,
    });
    await setWishlistPublication("e2e-owner", list.id, "PUBLISHED");
    const wish = await prisma.wish.create({
      data: {
        wishlistId: list.id,
        title: "Reserved book",
        reservations: { create: { userId: "e2e-member" } },
      },
      include: { reservations: true },
    });
    const data = new FormData();
    data.set("publication", "DRAFT");
    auth.userId = "e2e-member";
    const denied = await changePublication(list.id, EMPTY_ACTION_STATE, data);
    expect(denied.status).toBe("ERROR");
    expect(denied.reservationReview).toBeUndefined();
    auth.userId = "e2e-owner";
    const review = await changePublication(list.id, EMPTY_ACTION_STATE, data);
    expect(review.status).toBe("REVIEW");
    expect(review.reservationReview).toEqual([
      { id: wish.reservations[0].id, wishTitle: "Reserved book" },
    ]);
    expect((await readManagedWishlist(list.id, "e2e-owner"))?.publication).toBe(
      "PUBLISHED",
    );
    data.append("confirmedReservation", "another-reservation");
    expect((await changePublication(list.id, review, data)).status).toBe(
      "REVIEW",
    );
    data.set("confirmedReservation", wish.reservations[0].id);
    expect((await changePublication(list.id, review, data)).status).toBe(
      "SUCCESS",
    );
    expect((await readManagedWishlist(list.id, "e2e-owner"))?.publication).toBe(
      "DRAFT",
    );
    expect(
      (
        await prisma.reservation.findUniqueOrThrow({
          where: { id: wish.reservations[0].id },
        })
      ).endedAt,
    ).not.toBeNull();
  });

  it("counts available wishes and active reservations without hidden content, history or reserver identities", async () => {
    const list = await createWishlist("e2e-owner", {
      ...input,
      reservationsEnabled: true,
    });
    await setWishlistPublication("e2e-owner", list.id, "PUBLISHED");
    await prisma.wish.createMany({
      data: [
        { id: "count-available", wishlistId: list.id, title: "Available" },
        { id: "count-reserved", wishlistId: list.id, title: "Reserved" },
        { id: "count-canceled", wishlistId: list.id, title: "Canceled" },
        {
          id: "count-hidden",
          wishlistId: list.id,
          title: "Hidden",
          hidden: true,
        },
        {
          id: "count-fulfilled",
          wishlistId: list.id,
          title: "Fulfilled",
          fulfilledAt: new Date(),
        },
      ],
    });
    const reservation = await prisma.reservation.create({
      data: { wishId: "count-reserved", userId: "e2e-member" },
    });
    await prisma.reservation.create({
      data: {
        wishId: "count-canceled",
        userId: "e2e-member",
        createdAt: new Date("2026-01-01T12:00:00Z"),
        endedAt: new Date("2026-01-01T12:01:00Z"),
      },
    });
    await updateWishlist("e2e-owner", list.id, input);

    const owned = await readMyWishlists("e2e-owner");
    expect(owned.lists).toMatchObject([
      {
        id: list.id,
        availableWishCount: 2,
        reservedWishCount: 1,
        reservationsEnabled: false,
      },
    ]);
    expect(JSON.stringify(owned)).not.toContain("e2e-member");
    expect(JSON.stringify(owned)).not.toContain(reservation.id);
    expect((await readMyWishlists("e2e-member")).lists).not.toContainEqual(
      expect.objectContaining({ id: list.id }),
    );

    await cancelReservation(
      "e2e-member",
      list.id,
      "count-reserved",
      reservation.id,
    );
    expect((await readMyWishlists("e2e-owner")).lists).toMatchObject([
      { availableWishCount: 3, reservedWishCount: 0 },
    ]);
  });

  it("creates a visible public list and admin membership using session identity, ignoring injected fields", async () => {
    const data = new FormData();
    data.set("title", "  Birthday ideas  ");
    data.set("description", "  A few things I love.  ");
    data.set("ownerId", "e2e-member");

    await expect(createList(EMPTY_ACTION_STATE, data)).rejects.toThrow(
      "REDIRECT:/en/lists/",
    );

    const list = await prisma.wishlist.findFirstOrThrow({
      where: { title: input.title },
      include: { memberships: true },
    });

    expect(list).toMatchObject({
      ...input,
      ownerId: "e2e-owner",
      publication: "PUBLISHED",
      visibility: "PUBLIC",
    });
    expect(list.memberships).toMatchObject([
      { userId: "e2e-owner", role: "ADMIN" },
    ]);

    await expect(createWishlist("e2e-owner", input)).resolves.toHaveProperty(
      "id",
    );
  });

  it("creates a hidden public list for a Free account through the creation action", async () => {
    const data = new FormData();
    data.set("title", "Hidden ideas");
    data.set("publication", "DRAFT");
    data.set("visibility", "PUBLIC");
    await expect(createList(EMPTY_ACTION_STATE, data)).rejects.toThrow(
      "REDIRECT:/en/lists/",
    );
    const list = await prisma.wishlist.findFirstOrThrow({
      where: { title: "Hidden ideas" },
      include: { memberships: true },
    });
    expect(list).toMatchObject({
      publication: "DRAFT",
      visibility: "PUBLIC",
      ownerId: "e2e-owner",
      memberships: [
        expect.objectContaining({ userId: "e2e-owner", role: "ADMIN" }),
      ],
    });
    expect(await readWishlist(list.id, "e2e-member")).toBeNull();
    expect(await readWishlist(list.id, null)).toBeNull();
  });

  it.each(["HIDDEN", "PUBLIC"] as const)(
    "uses the submitted %s access choice rather than client-derived visibility fields",
    async (access) => {
      const data = new FormData();
      data.set("title", "Server-authoritative access");
      data.set("access", access);
      data.set("publication", access === "HIDDEN" ? "PUBLISHED" : "DRAFT");
      await expect(createList(EMPTY_ACTION_STATE, data)).rejects.toThrow(
        "REDIRECT:/en/lists/",
      );
      expect(
        await prisma.wishlist.findFirstOrThrow({
          where: { title: "Server-authoritative access" },
        }),
      ).toMatchObject({
        publication: access === "HIDDEN" ? "DRAFT" : "PUBLISHED",
        visibility: "PUBLIC",
      });
    },
  );

  it("does not fall back to public access for an invalid or unavailable private choice", async () => {
    const data = new FormData();
    data.set("title", "Rejected access");
    data.set("access", "INVALID");
    expect((await createList(EMPTY_ACTION_STATE, data)).status).toBe("ERROR");
    data.set("access", "PRIVATE");
    expect((await createList(EMPTY_ACTION_STATE, data)).status).toBe("ERROR");
    expect(
      await prisma.wishlist.count({ where: { title: "Rejected access" } }),
    ).toBe(0);
  });

  it("rejects invalid publication states during creation", async () => {
    const data = new FormData();
    data.set("title", "Invalid state");
    data.set("publication", "PRIVATE");
    expect(await createList(EMPTY_ACTION_STATE, data)).toMatchObject({
      status: "ERROR",
    });
    expect(
      await prisma.wishlist.count({ where: { title: "Invalid state" } }),
    ).toBe(0);
  });

  it("saves settings in place and keeps ownership and visibility unchanged", async () => {
    const list = await createWishlist("e2e-owner", input);
    const data = new FormData();
    data.set("title", "  Updated ideas  ");
    data.set("description", "  For the summer  ");
    data.set("reservationsEnabled", "on");
    data.set("ownerId", "e2e-member");
    data.set("publication", "DRAFT");
    data.set("visibility", "PRIVATE");

    await expect(
      updateList(list.id, EMPTY_ACTION_STATE, data),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      message: "Changes saved.",
    });
    expect(await readManagedWishlist(list.id, "e2e-owner")).toMatchObject({
      title: "Updated ideas",
      description: "For the summer",
      reservationsEnabled: true,
      ownerId: "e2e-owner",
      publication: "PUBLISHED",
      visibility: "PUBLIC",
    });
  });

  it.each(listThemeIds)(
    "persists the %s theme through creation and settings actions",
    async (theme) => {
      await prisma.premiumGrant.create({
        data: {
          userId: "e2e-owner",
          startsAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      const data = new FormData();
      data.set("title", `Theme ${theme}`);
      data.set("theme", theme);
      await expect(createList(EMPTY_ACTION_STATE, data)).rejects.toThrow(
        "REDIRECT:/en/lists/",
      );
      const created = await prisma.wishlist.findFirstOrThrow({
        where: { title: `Theme ${theme}` },
      });
      expect(created.theme).toBe(theme);

      const list = await createWishlist("e2e-owner", input);
      data.set("title", input.title);
      expect(await updateList(list.id, EMPTY_ACTION_STATE, data)).toMatchObject(
        { status: "SUCCESS", message: "Changes saved." },
      );
      expect(await readManagedWishlist(list.id, "e2e-owner")).toMatchObject({
        theme,
      });
    },
  );

  it("rejects unsupported themes at the database boundary", async () => {
    const list = await createWishlist("e2e-owner", input);
    await expect(
      prisma.wishlist.update({
        where: { id: list.id },
        data: { theme: "unsupported" },
      }),
    ).rejects.toThrow("Wishlist_theme_check");
    expect(await readManagedWishlist(list.id, "e2e-owner")).toMatchObject({
      theme: "classic",
    });
  });

  it("rejects invalid fields and unverified actors without persisting a list", async () => {
    for (const invalid of [
      { title: "   " },
      { title: "x".repeat(201) },
      { description: "x".repeat(2001) },
      { reservationsEnabled: "true" },
    ]) {
      await expect(
        createWishlist("e2e-owner", { ...input, ...invalid }),
      ).rejects.toThrow();
    }

    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { emailVerified: false },
    });
    await expect(createWishlist("e2e-owner", input)).rejects.toThrow(
      "verified account",
    );
    expect(await prisma.wishlist.count({ where: { title: input.title } })).toBe(
      0,
    );
  });

  it("rejects a Free account submitting private visibility through the action", async () => {
    const data = new FormData();
    data.set("title", "Private attempt");
    data.set("description", "");
    data.set("visibility", "PRIVATE");
    expect(await createList(EMPTY_ACTION_STATE, data)).toMatchObject({
      status: "ERROR",
      message: "Active Premium access is required for this action.",
    });
    expect(
      await prisma.wishlist.count({ where: { title: "Private attempt" } }),
    ).toBe(0);
  });

  it("restricts drafts to admins and never returns private content or membership identities to outsiders", async () => {
    const list = await createWishlist("e2e-owner", input);
    await setWishlistPublication("e2e-owner", list.id, "DRAFT");

    expect(await readWishlist(list.id, null)).toBeNull();
    expect(await readWishlist(list.id, "e2e-member")).toBeNull();
    expect(await readWishlist("e2e-private-list", "e2e-owner")).toBeNull();

    await prisma.membership.create({
      data: { wishlistId: list.id, userId: "e2e-member", role: "MEMBER" },
    });
    expect(await readWishlist(list.id, "e2e-member")).toBeNull();

    await setWishlistPublication("e2e-owner", list.id, "PUBLISHED");
    expect(await readWishlist(list.id, null)).toEqual({
      theme: "classic",
      id: list.id,
      image: null,
      ...input,
      publication: "PUBLISHED",
      visibility: "PUBLIC",
      canManage: false,
      owner: { username: "e2e-owner" },
    });

    await prisma.wishlist.update({
      where: { id: list.id },
      data: { visibility: "PRIVATE" },
    });
    expect(await readWishlist(list.id, null)).toBeNull();
    expect(await readWishlist(list.id, "e2e-member")).toMatchObject({
      canManage: false,
    });

    await setWishlistPublication("e2e-owner", list.id, "DRAFT");
    await prisma.membership.update({
      where: {
        wishlistId_userId: { wishlistId: list.id, userId: "e2e-member" },
      },
      data: { role: "ADMIN" },
    });
    expect(await readWishlist(list.id, "e2e-member")).toMatchObject({
      canManage: true,
    });
  });

  it("rejects direct update, publication, and deletion actions by a non-admin", async () => {
    const list = await createWishlist("e2e-owner", input);
    await setWishlistPublication("e2e-owner", list.id, "PUBLISHED");
    await prisma.membership.create({
      data: { wishlistId: list.id, userId: "e2e-member", role: "MEMBER" },
    });
    auth.userId = "e2e-member";

    const data = new FormData();
    data.set("title", "Hijacked");
    data.set("ownerId", "e2e-owner");
    data.set("publication", "DRAFT");
    data.set("confirm", "delete");

    for (const action of [updateList, changePublication, deleteList]) {
      expect(await action(list.id, EMPTY_ACTION_STATE, data)).toMatchObject({
        status: "ERROR",
        message: expect.stringContaining("unavailable"),
      });
    }

    expect(await readManagedWishlist(list.id, "e2e-member")).toBeNull();
    expect(
      await prisma.wishlist.findUnique({ where: { id: list.id } }),
    ).toMatchObject({
      title: input.title,
      ownerId: "e2e-owner",
      publication: "PUBLISHED",
    });
  });

  it("permits another admin to edit but strips ownership and visibility changes", async () => {
    const list = await createWishlist("e2e-owner", input);
    await prisma.membership.create({
      data: { wishlistId: list.id, userId: "e2e-member", role: "ADMIN" },
    });

    await updateWishlist("e2e-member", list.id, {
      ...input,
      title: "Updated",
      description: "  ",
      ownerId: "e2e-member",
      visibility: "PRIVATE",
      publication: "PUBLISHED",
    });

    expect(await readManagedWishlist(list.id, "e2e-member")).toMatchObject({
      title: "Updated",
      description: null,
      visibility: "PUBLIC",
      publication: "PUBLISHED",
    });
    expect(
      (await prisma.wishlist.findUniqueOrThrow({ where: { id: list.id } }))
        .ownerId,
    ).toBe("e2e-owner");
  });

  it("rechecks revoked admin access, verification, archived and missing lists", async () => {
    const list = await createWishlist("e2e-owner", input);
    await prisma.membership.create({
      data: { wishlistId: list.id, userId: "e2e-member", role: "ADMIN" },
    });
    await prisma.membership.delete({
      where: {
        wishlistId_userId: { wishlistId: list.id, userId: "e2e-member" },
      },
    });

    await expect(updateWishlist("e2e-member", list.id, input)).rejects.toThrow(
      "unavailable",
    );
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { emailVerified: false },
    });
    await expect(updateWishlist("e2e-owner", list.id, input)).rejects.toThrow(
      "unavailable",
    );

    for (const id of ["e2e-archived-list", "e2e-missing-list"]) {
      expect(await readWishlist(id, "e2e-owner")).toBeNull();
      await expect(
        setWishlistPublication("e2e-owner", id, "PUBLISHED"),
      ).rejects.toThrow("unavailable");
      await expect(deleteWishlist("e2e-owner", id)).rejects.toThrow(
        "unavailable",
      );
    }
  });

  it("preserves reservations when disabled, ends them on unpublish, and never restores them", async () => {
    const list = await createWishlist("e2e-owner", {
      ...input,
      reservationsEnabled: true,
    });
    await setWishlistPublication("e2e-owner", list.id, "PUBLISHED");
    const wish = await prisma.wish.create({
      data: {
        wishlistId: list.id,
        title: "A book",
        reservations: { create: { userId: "e2e-member" } },
      },
    });

    await updateWishlist("e2e-owner", list.id, input);
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: null },
      }),
    ).toBe(1);

    await expect(
      setWishlistPublication("e2e-owner", list.id, "DRAFT"),
    ).rejects.toThrow("Review the reserved wishes");
    const reservation = await prisma.reservation.findFirstOrThrow({
      where: { wishId: wish.id, endedAt: null },
    });
    await Promise.all([
      setWishlistPublication("e2e-owner", list.id, "DRAFT", [reservation.id]),
      updateWishlist("e2e-owner", list.id, {
        ...input,
        title: "Edited concurrently",
      }),
    ]);

    expect(await readWishlist(list.id, null)).toBeNull();
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: null },
      }),
    ).toBe(0);

    await setWishlistPublication("e2e-owner", list.id, "PUBLISHED");
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: null },
      }),
    ).toBe(0);
  });

  it("requires deletion confirmation and cascades content without deleting either user", async () => {
    const result = await deleteList(
      "e2e-private-list",
      EMPTY_ACTION_STATE,
      new FormData(),
    );
    expect(result.status).toBe("ERROR");

    await prisma.reservation.create({
      data: { wishId: "e2e-wish", userId: "e2e-owner" },
    });
    await deleteWishlist("e2e-member", "e2e-private-list");

    expect(await readWishlist("e2e-private-list", "e2e-member")).toBeNull();
    expect(
      await prisma.wish.count({ where: { wishlistId: "e2e-private-list" } }),
    ).toBe(0);
    expect(
      await prisma.membership.count({
        where: { wishlistId: "e2e-private-list" },
      }),
    ).toBe(0);
    expect(
      await prisma.reservation.count({ where: { wishId: "e2e-wish" } }),
    ).toBe(0);
    expect(
      await prisma.user.count({
        where: { id: { in: ["e2e-owner", "e2e-member"] } },
      }),
    ).toBe(2);
  });

  it("paginates owned active lists without leaking other owners or archives", async () => {
    for (let index = 0; index < 21; index++) {
      await createWishlist("e2e-owner", { ...input, title: `List ${index}` });
    }

    const first = await readMyWishlists("e2e-owner");
    const second = await readMyWishlists("e2e-owner", 2);

    expect(first.lists).toHaveLength(20);
    expect(first.hasNextPage).toBe(true);
    expect(second.lists).toHaveLength(1);
    expect(second.hasNextPage).toBe(false);
    expect(
      new Set([...first.lists, ...second.lists].map((list) => list.id)).size,
    ).toBe(21);
    expect((await readMyWishlists("e2e-owner", Number.NaN)).page).toBe(1);
  });
});

it("defaults creation to visible with reservations, while preserving explicit reservation opt-out", async () => {
  const list = await createWishlist("e2e-owner", {
    title: "Default list",
    description: "",
  });
  expect(await readWishlist(list.id, null)).toMatchObject({
    publication: "PUBLISHED",
    reservationsEnabled: true,
  });
  const disabled = await createWishlist("e2e-owner", input);
  expect(await readWishlist(disabled.id, null)).toMatchObject({
    reservationsEnabled: false,
  });
});

it("combines owned and joined lists without duplicate cards or hidden contents", async () => {
  await createWishlist("e2e-owner", input);
  await prisma.membership.create({
    data: {
      wishlistId: "e2e-private-list",
      userId: "e2e-owner",
      role: "MEMBER",
    },
  });
  expect((await readMyWishlists("e2e-owner")).lists).toHaveLength(1);
  await prisma.wishlist.update({
    where: { id: "e2e-private-list" },
    data: { publication: "DRAFT" },
  });
  const hidden = await readMyWishlists("e2e-owner", 1, true);
  expect(hidden.lists).toHaveLength(2);
  expect(
    hidden.lists.find(({ id }) => id === "e2e-private-list"),
  ).toMatchObject({
    title: null,
    owner: null,
    image: null,
    previewImages: [],
    availableWishCount: 0,
    reservedWishCount: 0,
    canManage: false,
  });
  expect(JSON.stringify(hidden)).not.toContain("Another person's private list");
  await prisma.wishlist.update({
    where: { id: "e2e-private-list" },
    data: { publication: "PUBLISHED" },
  });
  expect(
    (await readMyWishlists("e2e-owner", 1, true)).lists.find(
      ({ id }) => id === "e2e-private-list",
    ),
  ).toMatchObject({ title: "Another person's private list", canManage: false });
});
