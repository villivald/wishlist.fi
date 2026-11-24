import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ACTION_STATE } from "@/components/form/utils/to-action-state";
import { readableImage } from "@/features/media/service/media";
import { mediaStorage } from "@/features/media/service/storage";
import { readImageVariant } from "@/features/media/service/variants";
import { imageVariantPath } from "@/features/media/variants";
import {
  addWish,
  changeWishState,
  editWish,
  removeWish,
  submitWishTransfer,
} from "@/features/wish/actions/manage-wish";
import {
  readWishDestinations,
  transferWishes,
} from "@/features/wish/service/transfer";
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

const transferWish = async (
  userId: string,
  listId: string,
  wishId: string,
  operation: "move" | "copy",
  destination: unknown,
  requestId?: string,
) =>
  (
    await transferWishes(
      userId,
      listId,
      wishId,
      operation,
      [destination],
      requestId,
    )
  )[0]!;

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

describe("wish transfers", () => {
  it("validates the whole batch before copying and deduplicates retries per destination", async () => {
    const first = await createWishlist("e2e-owner", {
      title: "First",
      description: "",
    });
    const second = await createWishlist("e2e-owner", {
      title: "Second",
      description: "",
    });
    const bytes = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const wish = await createWish(
      "e2e-owner",
      listId,
      { title: "Batch wish" },
      { bytes, alt: "Map" },
    );
    const key = randomUUID();
    const submit = (
      destinations: unknown[],
      operation: "move" | "copy" = "copy",
    ) =>
      transferWishes(
        "e2e-owner",
        listId,
        wish.id,
        operation,
        destinations,
        key,
      );
    const targets = [
      [first.id, "PUBLIC"],
      [second.id, "PUBLIC"],
    ];
    await expect(
      submit([targets[0], ["e2e-private-list", "PRIVATE"]]),
    ).rejects.toThrow("destination list");
    await expect(submit(targets, "move")).rejects.toThrow("one destination");
    expect(await prisma.wish.count({ where: { title: "Batch wish" } })).toBe(1);
    const [copies, replay] = await Promise.all([
      submit(targets),
      submit(targets),
    ]);
    expect(replay).toEqual(copies);
    expect(
      await prisma.media.count({
        where: {
          wishId: { in: copies.map((copy) => copy.id) },
          alt: "Map",
          state: "READY",
        },
      }),
    ).toBe(2);
    expect(copies.map((copy) => copy.destinationId)).toEqual([
      first.id,
      second.id,
    ]);
    expect(await prisma.wish.count({ where: { title: "Batch wish" } })).toBe(3);
  });
  it("moves the same wish, image and favorite to an administered list", async () => {
    const destination = "e2e-private-list";
    await prisma.membership.create({
      data: { wishlistId: destination, userId: "e2e-owner", role: "ADMIN" },
    });
    const bytes = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const wish = await createWish(
      "e2e-owner",
      listId,
      {
        title: "Move the original",
        hidden: true,
        price: "0",
        currency: "GBP",
      },
      { bytes, alt: "Original image" },
    );
    await transitionWish("e2e-owner", listId, wish.id, "fulfill");
    const original = await prisma.wish.findUniqueOrThrow({
      where: { id: wish.id },
    });
    const image = await prisma.media.findUniqueOrThrow({
      where: { wishId: wish.id },
    });
    const favorite = await prisma.favoriteWish.create({
      data: { userId: "e2e-owner", wishId: wish.id },
    });
    expect(await readWishDestinations("e2e-owner", listId, "move")).toEqual([
      expect.objectContaining({ id: destination }),
    ]);
    expect(await readWishDestinations("e2e-owner", listId, "copy")).toEqual([]);
    const form = new FormData();
    form.set("destination", `${destination}:PRIVATE`);

    await expect(
      submitWishTransfer(
        "move",
        listId,
        wish.id,
        randomUUID(),
        EMPTY_ACTION_STATE,
        form,
      ),
    ).rejects.toThrow(
      `REDIRECT:/en/lists/${destination}/wishes/${wish.id}?moved=1`,
    );
    expect(await readWish(listId, wish.id, "e2e-owner")).toBeNull();
    expect(
      await prisma.wish.findUniqueOrThrow({ where: { id: wish.id } }),
    ).toEqual({
      ...original,
      wishlistId: destination,
      updatedAt: expect.any(Date),
    });
    expect(await readableImage(image.id, "e2e-owner")).not.toBeNull();
    expect(await readableImage(image.id, null)).toBeNull();
    expect(
      await prisma.favoriteWish.findUnique({ where: { id: favorite.id } }),
    ).toEqual(favorite);
  });

  it("copies readable wishes into owned lists, preserving fields and image bytes independently", async () => {
    const destination = "e2e-private-list";
    const bytes = await sharp({
      create: { width: 860, height: 430, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const original = await createWish(
      "e2e-owner",
      listId,
      {
        title: "Copy with an image",
        description: "Exact details",
        externalUrl: "https://shop.example/exact",
        price: "0",
        currency: "USD",
        priority: "5",
      },
      { bytes, alt: "Blue rectangle" },
    );
    const reservation = await prisma.reservation.create({
      data: { wishId: original.id, userId: "e2e-member", groupEnabled: true },
    });
    const source = await prisma.wish.findUniqueOrThrow({
      where: { id: original.id },
      include: { image: true },
    });
    const requestId = randomUUID();
    const copy = await transferWish(
      "e2e-member",
      listId,
      original.id,
      "copy",
      [destination, "PRIVATE"],
      requestId,
    );
    await expect(
      transferWish(
        "e2e-member",
        listId,
        original.id,
        "copy",
        [destination, "PRIVATE"],
        requestId,
      ),
    ).resolves.toEqual(copy);
    expect(
      await prisma.wish.count({
        where: { wishlistId: destination, title: source.title },
      }),
    ).toBe(1);
    const saved = await prisma.wish.findUniqueOrThrow({
      where: { id: copy.id },
      include: { image: true, reservations: true },
    });
    expect(saved).toMatchObject({
      title: source.title,
      description: source.description,
      externalUrl: source.externalUrl,
      priceMinor: 0,
      currency: "USD",
      priority: 5,
      authorId: "e2e-member",
      wishlistId: destination,
      reservations: [],
      image: {
        alt: source.image!.alt,
        width: source.image!.width,
        height: source.image!.height,
        bytes: source.image!.bytes,
        variantWidths: source.image!.variantWidths,
      },
    });
    expect(saved.image!.id).not.toBe(source.image!.id);
    expect(saved.image!.pathname).not.toBe(source.image!.pathname);
    for (const width of [null, ...source.image!.variantWidths]) {
      const originalBytes = await readImageVariant(source.image!, width);
      const copyBytes = await readImageVariant(saved.image!, width);
      expect(copyBytes).not.toBeNull();
      expect(copyBytes).toEqual(originalBytes);
    }
    expect(
      await prisma.reservation.findUnique({ where: { id: reservation.id } }),
    ).toEqual(reservation);

    await deleteWish("e2e-owner", listId, original.id);
    expect(await readableImage(saved.image!.id, "e2e-member")).not.toBeNull();
    expect(await readableImage(saved.image!.id, null)).toBeNull();
  });

  it("preserves hidden and fulfilled status when an admin copies a wish", async () => {
    const destination = await createWishlist("e2e-owner", {
      title: "Hidden destination",
      description: "",
      publication: "DRAFT",
    });
    const wish = await createWish("e2e-owner", listId, {
      title: "Secret",
      hidden: true,
    });
    await transitionWish("e2e-owner", listId, wish.id, "fulfill");
    const original = await readWish(listId, wish.id, "e2e-owner");
    const copy = await transferWish(
      "e2e-owner",
      listId,
      wish.id,
      "copy",
      [destination.id, "HIDDEN"],
      randomUUID(),
    );
    expect(await readWish(destination.id, copy.id, "e2e-owner")).toMatchObject({
      hidden: true,
      fulfilledAt: original?.fulfilledAt,
    });
    expect(await readWish(destination.id, copy.id, null)).toBeNull();
    expect(await readWish(listId, wish.id, "e2e-owner")).toEqual(original);
  });

  it("rejects the wrong source, view-only move access, unowned copies, and stale destinations", async () => {
    const destination = "e2e-private-list";
    const wish = await createWish("e2e-owner", listId, { title: "Stay here" });
    const form = new FormData();
    form.set("destination", `${destination}:PRIVATE`);
    auth.userId = "e2e-member";
    const move = submitWishTransfer.bind(
      null,
      "move",
      listId,
      wish.id,
      randomUUID(),
      EMPTY_ACTION_STATE,
    );
    expect(await move(form)).toMatchObject({
      status: "ERROR",
      message: expect.stringContaining("permission"),
    });

    auth.userId = "e2e-owner";
    const membership = await prisma.membership.create({
      data: { wishlistId: destination, userId: "e2e-owner", role: "MEMBER" },
    });
    expect(await move(form)).toMatchObject({
      status: "ERROR",
      message: expect.stringContaining("destination list"),
    });
    await prisma.membership.update({
      where: { id: membership.id },
      data: { role: "ADMIN" },
    });
    await expect(
      transferWish(
        "e2e-owner",
        listId,
        wish.id,
        "copy",
        [destination, "PRIVATE"],
        randomUUID(),
      ),
    ).rejects.toThrow("destination list");
    await expect(
      transferWish("e2e-owner", listId, wish.id, "move", [listId, "PUBLIC"]),
    ).rejects.toThrow("different");
    await expect(
      transferWish("e2e-owner", listId, "e2e-wish", "move", [
        destination,
        "PRIVATE",
      ]),
    ).rejects.toThrow("permission");
    await expect(
      transferWish("e2e-owner", listId, wish.id, "move", [
        destination,
        "PUBLIC",
      ]),
    ).rejects.toThrow("has changed");
    await prisma.membership.delete({ where: { id: membership.id } });
    expect(await move(form)).toMatchObject({
      status: "ERROR",
      message: expect.stringContaining("destination list"),
    });
    expect(await readWish(listId, wish.id, "e2e-owner")).not.toBeNull();

    await transitionWish("e2e-owner", listId, wish.id, "hide");
    await expect(
      transferWish(
        "e2e-member",
        listId,
        wish.id,
        "copy",
        [destination, "PRIVATE"],
        randomUUID(),
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      transferWish(
        "e2e-owner",
        destination,
        "e2e-wish",
        "copy",
        [listId, "PUBLIC"],
        randomUUID(),
      ),
    ).rejects.toThrow("unavailable");
    await prisma.user.update({
      where: { id: "e2e-owner" },
      data: { emailVerified: false },
    });
    expect(
      await readWishDestinations("e2e-owner", destination, "copy"),
    ).toEqual([]);
  });

  it("keeps the wish and active reservation intact and safely handles repeated moves", async () => {
    const destination = await createWishlist("e2e-owner", {
      title: "Destination",
      description: "",
    });
    const wish = await createWish("e2e-owner", listId, { title: "Reserved" });
    const reservation = await prisma.reservation.create({
      data: { wishId: wish.id, userId: "e2e-member" },
    });
    const move = () =>
      transferWish("e2e-owner", listId, wish.id, "move", [
        destination.id,
        "PUBLIC",
      ]);
    await expect(move()).rejects.toThrow("active reservation");
    expect(await readWish(listId, wish.id, "e2e-member")).toMatchObject({
      isReservedByYou: true,
    });
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { endedAt: new Date() },
    });
    const results = await Promise.allSettled([move(), move()]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      await prisma.wish.findUnique({ where: { id: wish.id } }),
    ).toMatchObject({ wishlistId: destination.id });
    expect(
      await prisma.reservation.count({
        where: { wishId: wish.id, endedAt: { not: null } },
      }),
    ).toBe(1);
  });

  it("does not save a partial copy if an image file is missing", async () => {
    const bytes = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const source = await createWish(
      "e2e-owner",
      listId,
      { title: "Image with missing variant" },
      { bytes, alt: "Image" },
    );
    const image = await prisma.media.findUniqueOrThrow({
      where: { wishId: source.id },
    });
    await mediaStorage.delete(
      image.provider,
      imageVariantPath(image.pathname, image.variantWidths[0]!),
    );
    await expect(
      transferWish(
        "e2e-member",
        listId,
        source.id,
        "copy",
        ["e2e-private-list", "PRIVATE"],
        randomUUID(),
      ),
    ).rejects.toThrow("image could not be copied");
    expect(
      await prisma.wish.count({
        where: {
          wishlistId: "e2e-private-list",
          title: "Image with missing variant",
        },
      }),
    ).toBe(0);
    expect(await readableImage(image.id, "e2e-owner")).not.toBeNull();
  });
});
