import { currencies, parsePriceMinor } from "@/features/wish/utils/money";
import { browsePath } from "@/paths";
import { maxSearchPage } from "@/utils/pagination";

export type DiscoveryQuery = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";
const sortOptions = [
  "newest",
  "title",
  "priority",
  "price-low",
  "price-high",
] as const;

export const parseDiscoveryQuery = (query: DiscoveryQuery) => {
  const requestedView = first(query.view);
  const view =
    requestedView === "wishes" || requestedView === "users"
      ? requestedView
      : "lists";
  const owner = view !== "users" ? first(query.owner).trim().slice(0, 40) : "";
  const rawSearch = first(query.q).trim();
  const q = rawSearch.slice(0, 120);
  const requestedPage = Number(first(query.page) || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, maxSearchPage)
      : 1;
  const currency =
    view === "wishes"
      ? currencies.find((value) => value === first(query.currency))
      : undefined;
  const requestedSort =
    sortOptions.find((value) => value === first(query.sort)) ?? "newest";
  const sort =
    view !== "wishes" && requestedSort !== "title" ? "newest" : requestedSort;
  const priority =
    view === "wishes" && /^[1-5]$/.test(first(query.priority))
      ? first(query.priority)
      : "";
  const min = view === "wishes" ? first(query.min).trim().slice(0, 24) : "";
  const max = view === "wishes" ? first(query.max).trim().slice(0, 24) : "";
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  let error =
    rawSearch.length > 120 ? "Use at most 120 characters for your search." : "";

  if ((min || max || sort.startsWith("price-")) && !currency) {
    error = "Choose a currency to filter or sort by price.";
  } else {
    try {
      minPrice = parsePriceMinor(min);
      maxPrice = parsePriceMinor(max);
      if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
        error = "Minimum price must not exceed maximum price.";
      }
    } catch {
      error = "Enter a valid price with at most two decimal places.";
    }
  }

  return {
    view,
    q,
    owner,
    page,
    currency,
    sort,
    priority,
    min,
    max,
    minPrice,
    maxPrice,
    reservable: view !== "users" && first(query.reservable) === "on",
    error,
  };
};

export type DiscoveryFilters = ReturnType<typeof parseDiscoveryQuery>;

export const discoveryUrl = (
  filters: DiscoveryFilters,
  page = 1,
  view = filters.view,
) => {
  const query = new URLSearchParams({ view });
  if (filters.q) {
    query.set("q", filters.q);
  }
  if (filters.owner && view !== "users") {
    query.set("owner", filters.owner);
  }
  if (filters.reservable && view !== "users") {
    query.set("reservable", "on");
  }
  if (view === filters.view) {
    query.set("sort", filters.sort);
    for (const field of ["currency", "priority", "min", "max"] as const) {
      if (filters[field]) {
        query.set(field, filters[field]);
      }
    }
  }
  if (page > 1) {
    query.set("page", String(page));
  }
  return `${browsePath}?${query}`;
};
