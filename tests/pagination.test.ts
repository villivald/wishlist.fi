import { expect, it, vi } from "vitest";
import { maxSearchPage, pageSize, readPageCount } from "@/utils/pagination";

it("infers the last page from a partial page and skips counting at the limit", () => {
  const count = vi.fn(() => Promise.resolve(100));
  expect(readPageCount(2, 2, maxSearchPage, count)).toBe(2);
  expect(readPageCount(maxSearchPage, pageSize + 1, maxSearchPage, count)).toBe(
    maxSearchPage,
  );
  expect(count).not.toHaveBeenCalled();
});

it("counts within the existing page limit and recovers from an empty stale page", async () => {
  const count = vi.fn(() => Promise.resolve(22));
  expect(await readPageCount(8, 0, maxSearchPage, count)).toBe(2);
  expect(count).toHaveBeenCalledWith(maxSearchPage * pageSize);
});

it("retains a populated page if concurrent removals shorten the count", async () => {
  expect(
    await readPageCount(3, pageSize + 1, maxSearchPage, () =>
      Promise.resolve(12),
    ),
  ).toBe(3);
});
