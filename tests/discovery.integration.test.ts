import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  discoverLists,
  discoverWishes,
} from "@/features/discovery/service/discovery";
import {
  cancelReservation,
  reserveWish,
} from "@/features/reservation/service/reservations";
import { createWish, transitionWish } from "@/features/wish/service/wishes";
import {
  createWishlist,
  deleteWishlist,
  setWishlistPublication,
} from "@/features/wishlist/service/lists";
import { prisma } from "@/lib/prisma";
import { assertTestDatabase } from "../e2e/environment";
import { resetFixtures } from "../e2e/seed";

let listId: string;
const listInput = {
  title: "Public birthday ideas",
  description: "Gifts and books",
  reservationsEnabled: true,
};

assertTestDatabase(process.env);
beforeEach(async () => {
  await resetFixtures();
  ({ id: listId } = await createWishlist("e2e-owner", listInput));
  await setWishlistPublication("e2e-owner", listId, "PUBLISHED");
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

describe("public discovery", () => {
  it("excludes private, draft, archived and unavailable content from results and counts", async () => {
    const visible = await createWish("e2e-owner", listId, {
      title: "Public notebook",
    });
    await createWish("e2e-owner", listId, {
      title: "Hidden secret marker",
      hidden: true,
    });
    const fulfilled = await createWish("e2e-owner", listId, {
      title: "Fulfilled secret marker",
    });
    await transitionWish("e2e-owner", listId, fulfilled.id, "fulfill");
    const reserved = await createWish("e2e-owner", listId, {
      title: "Reserved secret marker",
    });
    await reserveWish("e2e-member", listId, reserved.id);
    const draft = await createWishlist("e2e-owner", {
      ...listInput,
      title: "Draft secret marker",
    });
    await setWishlistPublication("e2e-owner", draft.id, "DRAFT");
    await createWish("e2e-owner", draft.id, {
      title: "Draft wish secret marker",
    });
    await prisma.wishlist.update({
      where: { id: "e2e-private-list" },
      data: { publication: "PUBLISHED" },
    });
    const lists = await discoverLists({
      userId: "e2e-owner",
      visibility: "PRIVATE",
    });
    expect(lists.lists).toMatchObject([{ id: listId, availableWishCount: 1 }]);
    expect(lists.lists).toHaveLength(1);
    expect((await discoverWishes({})).wishes.map(({ id }) => id)).toEqual([
      visible.id,
    ]);
    expect((await discoverWishes({ q: "secret marker" })).wishes).toEqual([]);
    expect((await discoverLists({ q: "secret marker" })).lists).toEqual([]);
    expect(JSON.stringify(lists)).not.toContain("ownerId");
    expect(JSON.stringify(lists)).not.toContain("e2e-member");
    expect(
      (await discoverLists({}, "e2e-owner")).lists[0].reservedWishCount,
    ).toBe(1);
    expect(JSON.stringify(await discoverWishes({}))).not.toContain("authorId");
  });

  it("searches case-insensitively across public text and treats SQL wildcard characters literally", async () => {
    const wish = await createWish("e2e-owner", listId, {
      title: "Notebook",
      description: "100% cotton cover_with_paper",
    });
    await createWish("e2e-owner", listId, { title: "Other item" });
    for (const q of ["NOTEBOOK", "cotton", "%", "_"]) {
      expect((await discoverWishes({ q })).wishes.map(({ id }) => id)).toEqual([
        wish.id,
      ]);
    }
    expect((await discoverWishes({ q: "birthday" })).wishes).toHaveLength(2);
    expect((await discoverLists({ q: "BOOKS" })).lists).toHaveLength(1);
    expect((await discoverLists({ q: "%" })).lists).toEqual([]);
  });

  it("sorts and filters prices within one currency, keeps zero, and excludes missing prices", async () => {
    const values = [
      { title: "Free", price: "0", currency: "EUR", priority: "5" },
      { title: "Book", price: "19,99", currency: "EUR", priority: "3" },
      { title: "Camera", price: "50", currency: "EUR", priority: "1" },
      { title: "Dollar item", price: "5", currency: "USD" },
      { title: "Pound item", price: "7", currency: "GBP" },
      { title: "Unpriced" },
    ];
    for (const value of values) {
      await createWish("e2e-owner", listId, value);
    }
    expect(
      (await discoverWishes({ sort: "price-low", currency: "EUR" })).wishes.map(
        ({ title }) => title,
      ),
    ).toEqual(["Free", "Book", "Camera"]);
    expect(
      (
        await discoverWishes({ sort: "price-high", currency: "EUR" })
      ).wishes.map(({ title }) => title),
    ).toEqual(["Camera", "Book", "Free"]);
    expect(
      (
        await discoverWishes({
          currency: "EUR",
          min: "0",
          max: "19.99",
          priority: "3",
          sort: "priority",
        })
      ).wishes.map(({ title }) => title),
    ).toEqual(["Free", "Book"]);
    expect(
      (await discoverWishes({ sort: "price-low", currency: "USD" })).wishes.map(
        ({ title }) => title,
      ),
    ).toEqual(["Dollar item"]);
    expect(
      (await discoverWishes({ sort: "price-low", currency: "GBP" })).wishes.map(
        ({ title }) => title,
      ),
    ).toEqual(["Pound item"]);
    expect((await discoverWishes({ sort: "price-low" })).wishes).toEqual([]);
    expect(
      (await discoverWishes({ currency: "EUR", min: "-1" })).wishes,
    ).toEqual([]);
  });

  it("filters reservation-enabled lists and their available wishes", async () => {
    await createWish("e2e-owner", listId, { title: "Reservable gift" });
    const other = await createWishlist("e2e-owner", {
      ...listInput,
      title: "Disabled list",
      reservationsEnabled: false,
    });
    await setWishlistPublication("e2e-owner", other.id, "PUBLISHED");
    await createWish("e2e-owner", other.id, { title: "Disabled gift" });
    expect(
      (await discoverLists({ reservable: "on" })).lists.map(({ id }) => id),
    ).toEqual([listId]);
    expect(
      (await discoverWishes({ reservable: "on" })).wishes.map(
        ({ title }) => title,
      ),
    ).toEqual(["Reservable gift"]);
  });

  it("keeps eligible lists in ordinary results until they are configured for curation", async () => {
    const curated = await createWishlist("e2e-owner", {
      ...listInput,
      title: "Example gift ideas",
      reservationsEnabled: false,
    });
    await setWishlistPublication("e2e-owner", curated.id, "PUBLISHED");
    const ordinaryIds = [curated.id, listId].sort();

    for (const value of [undefined, "", " , /invalid-id , missing-id "]) {
      vi.stubEnv("CURATED_WISHLIST_IDS", value);
      const ordinary = await discoverLists({});
      expect(ordinary.curatedLists).toEqual([]);
      expect(ordinary.lists.map(({ id }) => id).sort()).toEqual(ordinaryIds);
      expect(ordinary.hasNextPage).toBe(false);
    }

    vi.stubEnv("CURATED_WISHLIST_IDS", `${curated.id},${curated.id},${listId}`);
    const featured = await discoverLists({});
    expect(featured.curatedLists.map(({ id }) => id)).toEqual([curated.id]);
    expect(featured.lists.map(({ id }) => id)).toEqual([listId]);

    await prisma.wishlist.update({
      where: { id: curated.id },
      data: { reservationsEnabled: true },
    });
    const updated = await discoverLists({});
    expect(updated.curatedLists).toEqual([]);
    expect(updated.lists.map(({ id }) => id).sort()).toEqual(ordinaryIds);
  });

  it("paginates public lists and wishes with stable tie-breakers and bounded invalid input", async () => {
    const timestamp = new Date("2026-01-01T00:00:00Z");
    for (let index = 0; index < 22; index++) {
      const id = `e2e-discovery-${String(index).padStart(2, "0")}`;
      await prisma.wishlist.create({
        data: {
          id,
          title: "Repeated title",
          createdAt: timestamp,
          publication: "PUBLISHED",
          ownerId: "e2e-owner",
          memberships: { create: { userId: "e2e-owner", role: "ADMIN" } },
          wishes: {
            create: {
              title: "Repeated title",
              createdAt: timestamp,
              authorId: "e2e-owner",
            },
          },
        },
      });
    }
    const first = await discoverLists({ q: "Repeated", sort: "title" });
    const second = await discoverLists({
      q: "Repeated",
      sort: "title",
      page: "2",
    });
    expect(first.lists).toHaveLength(20);
    expect(first.hasNextPage).toBe(true);
    expect(second.lists).toHaveLength(2);
    expect(second.hasNextPage).toBe(false);
    expect(
      new Set([...first.lists, ...second.lists].map(({ id }) => id)).size,
    ).toBe(22);
    const firstWishes = await discoverWishes({ q: "Repeated", sort: "newest" });
    const nextWishes = await discoverWishes({
      q: "Repeated",
      sort: "newest",
      page: "2",
    });
    expect(firstWishes.wishes).toHaveLength(20);
    expect(nextWishes.wishes).toHaveLength(2);
    expect(
      new Set([...firstWishes.wishes, ...nextWishes.wishes].map(({ id }) => id))
        .size,
    ).toBe(22);
    expect((await discoverLists({ q: "x".repeat(121) })).lists).toEqual([]);
    expect((await discoverWishes({ page: "999999" })).filters.page).toBe(1000);
  });

  it("reflects reservation, visibility and lifecycle changes on subsequent reads", async () => {
    const wish = await createWish("e2e-owner", listId, { title: "Notebook" });
    await reserveWish("e2e-member", listId, wish.id);
    expect((await discoverWishes({})).wishes).toEqual([]);
    expect((await discoverLists({})).lists[0].availableWishCount).toBe(0);
    const reservation = await prisma.reservation.findFirstOrThrow({
      where: { wishId: wish.id, endedAt: null },
    });
    await cancelReservation("e2e-member", listId, wish.id, reservation.id);
    expect((await discoverWishes({})).wishes).toHaveLength(1);
    await transitionWish("e2e-owner", listId, wish.id, "hide");
    expect((await discoverWishes({})).wishes).toEqual([]);
    await transitionWish("e2e-owner", listId, wish.id, "unhide");
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PRIVATE" },
    });
    expect((await discoverLists({})).lists).toEqual([]);
    expect((await discoverWishes({})).wishes).toEqual([]);
    await prisma.wishlist.update({
      where: { id: listId },
      data: { visibility: "PUBLIC" },
    });
    await setWishlistPublication("e2e-owner", listId, "DRAFT");
    expect((await discoverLists({})).lists).toEqual([]);
    await setWishlistPublication("e2e-owner", listId, "PUBLISHED");
    expect((await discoverLists({})).lists).toHaveLength(1);
    await deleteWishlist("e2e-owner", listId);
    expect((await discoverLists({})).lists).toEqual([]);
  });
});
