import { z } from "zod";
import { maxSearchPage } from "@/utils/pagination";

export const favoriteInput = z.object({
  kind: z.enum(["list", "wish", "person"]),
  targetId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/),
  saved: z.boolean(),
});

export const parseFavoritesQuery = (
  query: { view?: string; page?: string },
  counts = { lists: 0, people: 0, wishes: 0 },
) => ({
  view:
    query.view === "lists" || query.view === "wishes" || query.view === "people"
      ? query.view
      : counts.lists > 0
        ? "lists"
        : counts.wishes > 0
          ? "wishes"
          : counts.people > 0
            ? "people"
            : "lists",
  page: /^\d{1,4}$/.test(query.page ?? "")
    ? Math.max(1, Math.min(maxSearchPage, Number(query.page)))
    : 1,
});
