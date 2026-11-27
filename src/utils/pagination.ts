export const pageSize = 20;
export const maxPage = 10_000;
export const maxSearchPage = 1_000;

// Page 1 remains a valid destination when a collection is empty.
export const pageCount = (count: number, limit = maxPage) =>
  Math.max(1, Math.min(limit, Math.ceil(count / pageSize)));

export const readPageCount = (
  page: number,
  rowCount: number,
  limit: number,
  count: (take: number) => PromiseLike<number>,
) => {
  if (rowCount > 0 && page === limit) return limit;
  if (rowCount <= pageSize && (rowCount > 0 || page === 1)) return page;

  // The lookahead proves there's more to read. Count only when the last
  // page can't be inferred, and stop at the route's existing page limit.
  return count(limit * pageSize).then((total) =>
    // A removal between reads can shorten the list while this page still has rows.
    Math.max(rowCount > 0 ? page : 1, pageCount(total, limit)),
  );
};
