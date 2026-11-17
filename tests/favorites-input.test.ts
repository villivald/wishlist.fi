import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/features/auth/utils/return-to";
import {
  favoriteInput,
  parseFavoritesQuery,
} from "@/features/favorites/service/schemas";

describe("favorites input boundaries", () => {
  it.each([
    [{ lists: 0, people: 0, wishes: 0 }, "lists"],
    [{ lists: 0, people: 1, wishes: 0 }, "people"],
    [{ lists: 0, people: 1, wishes: 1 }, "wishes"],
    [{ lists: 0, people: 0, wishes: 1 }, "wishes"],
    [{ lists: 1, people: 1, wishes: 1 }, "lists"],
  ])("opens the first non-empty category for %j", (counts, view) => {
    expect(parseFavoritesQuery({}, counts).view).toBe(view);
    expect(parseFavoritesQuery({ view: "invalid" }, counts).view).toBe(view);
    for (const explicitView of ["lists", "people", "wishes"]) {
      expect(parseFavoritesQuery({ view: explicitView }, counts).view).toBe(
        explicitView,
      );
    }
  });

  it("requires an explicit desired state and a valid target", () => {
    for (const input of [
      { kind: "guest", targetId: "wish", saved: true },
      { kind: "wish", targetId: "", saved: true },
      { kind: "wish", targetId: "../private", saved: true },
      { kind: "wish", targetId: "wish", saved: "false" },
    ])
      expect(favoriteInput.safeParse(input).success).toBe(false);
  });
  it("bounds page sizes and allows only the favorites viewing route as a login destination", () => {
    expect(parseFavoritesQuery({ view: "people", page: "9999" })).toEqual({
      view: "people",
      page: 1000,
    });
    expect(parseFavoritesQuery({ view: "private", page: "Infinity" })).toEqual({
      view: "lists",
      page: 1,
    });
    expect(safeReturnTo("/fi/favorites")).toBe("/fi/favorites");
    expect(safeReturnTo("/fi/favorites?next=evil")).toBe("/lists");
  });
});
