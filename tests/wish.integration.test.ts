import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import { readableImage } from "@/features/media/service/media";
import {
  addWish,
  changeWishState,
  editWish,
  removeWish,
} from "@/features/wish/actions/manage-wish";
import {
  createWish,
  deleteWish,
  readListWishes,
  readWish,
  transitionWish,
  updateWish,
} from "@/features/wish/service/wishes";
import {
  createWishlist,
  setWishlistPublication,
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

let listId: string;

assertTestDatabase(process.env);

beforeEach(async () => {
  auth.userId = "e2e-owner";
  await resetFixtures();
  ({ id: listId } = await createWishlist("e2e-owner", {
    title: "My wishes",
    description: "",
    reservationsEnabled: true,
  }));
  await setWishlistPublication("e2e-owner", listId, "PUBLISHED");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("wish permissions and lifecycle", () => {
  it("keeps, replaces and removes images together with wish details, without partial saves on invalid input", async () => {
    const bytes = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const wish = await createWish(
      "e2e-owner",
      listId,
      { title: "Original wish" },
      { bytes, alt: "Original image" },
    );
    const original = await prisma.media.findFirstOrThrow({
      where: { wishId: wish.id },
    });
    await updateWish("e2e-owner", listId, wish.id, {
      title: "Changed link",
      externalUrl: "https://shop.example/other",
    });
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await expect(
      updateWish(
        "e2e-owner",
        listId,
        wish.id,
        { title: "Should not save" },
        { bytes: Buffer.from("invalid"), alt: "Invalid" },
      ),
    ).rejects.toThrow();
    expect(
      (await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } })).title,
    ).toBe("Changed link");
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(original.id);
    await updateWish(
      "e2e-owner",
      listId,
      wish.id,
      { title: "With replacement" },
      { bytes, alt: "Replacement" },
    );
    const replacement = await prisma.media.findFirstOrThrow({
      where: { wishId: wish.id },
    });
    expect(replacement.id).not.toBe(original.id);
    expect(await readableImage(original.id, "e2e-owner")).toBeNull();
    await expect(
      updateWish("e2e-member", listId, wish.id, { title: "Forbidden" }, null),
    ).rejects.toThrow();
    expect(
      (await prisma.media.findFirstOrThrow({ where: { wishId: wish.id } })).id,
    ).toBe(replacement.id);
    await updateWish(
      "e2e-owner",
      listId,
      wish.id,
      { title: "Without image" },
      null,
    );
    expect(await prisma.media.count({ where: { wishId: wish.id } })).toBe(0);
    expect(
      (await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } })).title,
    ).toBe("Without image");
  });
  it("creates from session identity and ignores forged parent, author, and fulfillment fields", async () => {
    const data = new FormData();
    data.set("title", "Title-only wish");
    data.set("authorId", "e2e-member");
    data.set("wishlistId", "e2e-private-list");
    data.set("fulfilledAt", new Date().toISOString());

    await expect(addWish(listId, EMPTY_ACTION_STATE, data)).rejects.toThrow(
      "REDIRECT:/en/lists/",
    );
    expect(
      await prisma.wish.findFirst({ where: { title: "Title-only wish" } }),
    ).toMatchObject({
      authorId: "e2e-owner",
      wishlistId: listId,
      priceMinor: null,
      currency: null,
      priority: null,
      hidden: false,
      fulfilledAt: null,
    });
  });

  it("filters hidden, fulfilled, and reserved wishes from browsing and protects direct details", async () => {
    const visible = await createWish("e2e-owner", listId, { title: "Visible" });
    const hidden = await createWish("e2e-owner", listId, {
      title: "Hidden",
      hidden: true,
    });
    const fulfilled = await createWish("e2e-owner", listId, {
      title: "Fulfilled",
    });
    const reserved = await createWish("e2e-owner", listId, {
      title: "Reserved",
    });
    await transitionWish("e2e-owner", listId, fulfilled.id, "fulfill");
    await prisma.reservation.create({
      data: { wishId: reserved.id, userId: "e2e-member" },
    });

    for (const viewer of [null, "e2e-member"]) {
      expect(
        (await readListWishes(listId, viewer)).wishes.map((wish) => wish.id),
      ).toEqual(viewer ? [reserved.id, visible.id] : [visible.id]);
      expect(
        (await readListWishes(listId, viewer, { view: "fulfilled" })).wishes,
      ).toEqual([]);
      expect(await readWish(listId, hidden.id, viewer)).toBeNull();
      expect(await readWish(listId, fulfilled.id, viewer)).toBeNull();
    }

    expect(await readWish(listId, reserved.id, null)).toBeNull();
    expect(await readWish(listId, reserved.id, "e2e-member")).toMatchObject({
      isReservedByYou: true,
      canManage: false,
    });

    const ownerView = await readWish(listId, reserved.id, "e2e-owner");
    expect(ownerView).toMatchObject({
      isReserved: true,
      isReservedByYou: false,
      canManage: true,
    });
    expect(JSON.stringify(ownerView)).not.toContain("e2e-member");
    expect(ownerView).not.toHaveProperty("reservations");
    expect(ownerView).not.toHaveProperty("authorId");
    expect(
      (
        await readListWishes(listId, "e2e-owner", { view: "fulfilled" })
      ).wishes.map((wish) => wish.id),
    ).toEqual([fulfilled.id]);
  });

  it("enforces parent draft, private, archived, and membership rules on every read", async () => {
    const wish = await createWish("e2e-owner", listId, {
      title: "Private details",
    });
    await prisma.membership.create({
      data: { wishlistId: listId, userId: "e2e-member" },
    });
    await setWishlistPublication("e2e-owner", listId, "DRAFT");
    expect(await readWish(listId, wish.id, "e2e-member")).toBeNull();

    await setWishlistPublication("e2e-owner", listId, "PUBLISHED");
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PRIVATE" },
    });
    expect(await readWish(listId, wish.id, null)).toBeNull();
    expect(await readWish(listId, wish.id, "e2e-member")).not.toBeNull();
    await prisma.membership.delete({
      where: {
        wishlistId_userId: { wishlistId: listId, userId: "e2e-member" },
      },
    });
    expect(await readWish(listId, wish.id, "e2e-member")).toBeNull();

    await prisma.wishlist.update({
      where: { id: listId },
      data: { archivedAt: new Date() },
    });
    expect(await readWish(listId, wish.id, "e2e-owner")).toBeNull();
    expect((await readListWishes(listId, "e2e-owner")).wishes).toEqual([]);
    await expect(
      updateWish("e2e-owner", listId, wish.id, { title: "Changed" }),
    ).rejects.toThrow("unavailable");
  });

  it("rejects direct mutations by members and wishes supplied under another list", async () => {
    const wish = await createWish("e2e-owner", listId, { title: "Original" });
    await prisma.membership.create({
      data: { wishlistId: listId, userId: "e2e-member" },
    });
    auth.userId = "e2e-member";
    const data = new FormData();
    data.set("title", "Hijacked");
    data.set("authorId", "e2e-owner");
    data.set("transition", "fulfill");
    data.set("confirm", "delete");

    expect((await addWish(listId, EMPTY_ACTION_STATE, data)).status).toBe(
      "ERROR",
    );

    for (const action of [editWish, changeWishState, removeWish]) {
      expect(
        await action(listId, wish.id, EMPTY_ACTION_STATE, data),
      ).toMatchObject({
        status: "ERROR",
        message: expect.stringContaining("unavailable"),
      });
      expect(
        await action("e2e-private-list", wish.id, EMPTY_ACTION_STATE, data),
      ).toMatchObject({
        status: "ERROR",
        message: expect.stringContaining("unavailable"),
      });
    }

    expect(
      await readWish("e2e-private-list", wish.id, "e2e-member"),
    ).toBeNull();
    expect(await readWish(listId, wish.id, "e2e-owner")).toMatchObject({
      title: "Original",
      fulfilledAt: null,
    });
  });

  it("allows admins to edit without changing authorship, then denies revoked or unverified admins", async () => {
    const wish = await createWish("e2e-owner", listId, { title: "Original" });
    const membership = await prisma.membership.create({
      data: { wishlistId: listId, userId: "e2e-member", role: "ADMIN" },
    });
    await updateWish("e2e-member", listId, wish.id, {
      title: "Edited by admin",
      authorId: "e2e-member",
      wishlistId: "e2e-private-list",
    });
    expect(
      await prisma.wish.findUnique({ where: { id: wish.id } }),
    ).toMatchObject({ authorId: "e2e-owner", wishlistId: listId });

    await prisma.membership.delete({ where: { id: membership.id } });
    await expect(
      transitionWish("e2e-member", listId, wish.id, "hide"),
    ).rejects.toThrow("unavailable");
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { emailVerified: false },
    });
    await expect(deleteWish("e2e-owner", listId, wish.id)).rejects.toThrow(
      "unavailable",
    );
  });

  it("ends reservations on hiding or fulfillment and never restores them on reopening", async () => {
    const wish = await createWish("e2e-owner", listId, { title: "A book" });
    await prisma.reservation.create({
      data: { wishId: wish.id, userId: "e2e-member" },
    });
    await updateWish("e2e-owner", listId, wish.id, {
      title: "A book",
      hidden: true,
    });
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: null },
      }),
    ).toBe(0);
    await transitionWish("e2e-owner", listId, wish.id, "unhide");
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: null },
      }),
    ).toBe(0);

    await prisma.reservation.create({
      data: { wishId: wish.id, userId: "e2e-member" },
    });
    await transitionWish("e2e-owner", listId, wish.id, "fulfill");
    const fulfilledAt = (
      await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } })
    ).fulfilledAt;
    await transitionWish("e2e-owner", listId, wish.id, "fulfill");
    expect(
      (await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } }))
        .fulfilledAt,
    ).toEqual(fulfilledAt);
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: null },
      }),
    ).toBe(0);

    await transitionWish("e2e-owner", listId, wish.id, "hide");
    await transitionWish("e2e-owner", listId, wish.id, "reopen");
    expect(await readWish(listId, wish.id, "e2e-owner")).toMatchObject({
      hidden: true,
      fulfilledAt: null,
      isReserved: false,
    });
    expect(await readWish(listId, wish.id, null)).toBeNull();
  });

  it("serializes wish changes with list unpublication", async () => {
    const wish = await createWish("e2e-owner", listId, { title: "A book" });
    const reservation = await prisma.reservation.create({
      data: { wishId: wish.id, userId: "e2e-member" },
    });

    await Promise.all([
      transitionWish("e2e-owner", listId, wish.id, "hide"),
      setWishlistPublication("e2e-owner", listId, "DRAFT", [reservation.id]),
      updateWish("e2e-owner", listId, wish.id, {
        title: "Edited concurrently",
        hidden: true,
      }),
    ]);

    expect(await readWish(listId, wish.id, null)).toBeNull();
    expect(await readWish(listId, wish.id, "e2e-owner")).toMatchObject({
      title: "Edited concurrently",
      hidden: true,
      isReserved: false,
    });
  });

  it("saves each currency exactly, supports zero, clears optional fields, and keeps valid data on errors", async () => {
    const wish = await createWish("e2e-owner", listId, { title: "A book" });

    for (const currency of ["EUR", "USD", "GBP"]) {
      await updateWish("e2e-owner", listId, wish.id, {
        title: "A book",
        price: "19,99",
        currency,
        priority: "5",
      });
      expect(await readWish(listId, wish.id, null)).toMatchObject({
        priceMinor: 1999,
        currency,
        priority: 5,
      });
    }

    await expect(
      updateWish("e2e-owner", listId, wish.id, {
        title: "Bad input",
        price: "1.005",
        currency: "GBP",
      }),
    ).rejects.toThrow();
    expect(await readWish(listId, wish.id, null)).toMatchObject({
      title: "A book",
      priceMinor: 1999,
    });
    await updateWish("e2e-owner", listId, wish.id, {
      title: "Free",
      price: "0",
      currency: "EUR",
    });
    expect(await readWish(listId, wish.id, null)).toMatchObject({
      priceMinor: 0,
      currency: "EUR",
    });
    await updateWish("e2e-owner", listId, wish.id, {
      title: "Title only again",
    });
    expect(await readWish(listId, wish.id, null)).toMatchObject({
      priceMinor: null,
      currency: null,
      priority: null,
      description: null,
      externalUrl: null,
    });
  });

  it("orders and paginates only authorized wishes", async () => {
    for (let index = 0; index < 22; index++) {
      await createWish("e2e-owner", listId, {
        title: `Wish ${String(index).padStart(2, "0")}`,
        priority: index === 10 ? "5" : "",
        hidden: index === 21,
      });
    }

    const first = await readListWishes(listId, null, { sort: "title" });
    const second = await readListWishes(listId, null, {
      sort: "title",
      page: 2,
    });
    expect(first.wishes.map((wish) => wish.title)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `Wish ${String(index).padStart(2, "0")}`,
      ),
    );
    expect(first.hasNextPage).toBe(true);
    expect(second.wishes.map((wish) => wish.title)).toEqual(["Wish 20"]);
    expect(second.hasNextPage).toBe(false);
    expect(
      (await readListWishes(listId, null, { sort: "priority" })).wishes[0]
        .title,
    ).toBe("Wish 10");
    expect(
      (await readListWishes(listId, null, { sort: "oldest" })).wishes[0].title,
    ).toBe("Wish 00");
    expect(
      (await readListWishes(listId, null, { sort: "newest" })).wishes[0].title,
    ).toBe("Wish 20");
  });

  it("requires confirmation and deletes only the target wish and its reservations", async () => {
    const wish = await createWish("e2e-owner", listId, {
      title: "Delete this one",
    });
    await prisma.reservation.create({
      data: { wishId: wish.id, userId: "e2e-member" },
    });
    expect(
      (await removeWish(listId, wish.id, EMPTY_ACTION_STATE, new FormData()))
        .status,
    ).toBe("ERROR");
    expect(await readWish(listId, wish.id, "e2e-owner")).not.toBeNull();

    await deleteWish("e2e-owner", listId, wish.id);
    expect(await readWish(listId, wish.id, "e2e-owner")).toBeNull();
    expect(await prisma.reservation.count({ where: { wishId: wish.id } })).toBe(
      0,
    );
    expect(
      await prisma.wishlist.findUnique({ where: { id: listId } }),
    ).not.toBeNull();
    expect(
      await prisma.wish.findUnique({ where: { id: "e2e-wish" } }),
    ).not.toBeNull();
  });
});

it("filters reserved wishes before pagination and preserves viewer permissions", async () => {
  await createWish("e2e-owner", listId, { title: "Available" });
  const wish = await createWish("e2e-owner", listId, { title: "Mine" });
  await prisma.reservation.create({
    data: { wishId: wish.id, userId: "e2e-member" },
  });
  await prisma.wish.createMany({
    data: Array.from({ length: 25 }, (_, index) => ({
      wishlistId: listId,
      title: `Newer available ${index}`,
    })),
  });
  for (const userId of ["e2e-owner", "e2e-member"]) {
    const result = await readListWishes(listId, userId, { reserved: true });
    expect(result.wishes).toHaveLength(1);
    expect(result.wishes[0]).toMatchObject({
      id: wish.id,
      isReserved: true,
      isReservedByYou: userId === "e2e-member",
    });
    expect(JSON.stringify(result)).not.toContain("e2e-member");
  }
  expect(
    (await readListWishes(listId, null, { reserved: true })).wishes,
  ).toEqual([]);
});
