export function filterItems(items, query = "") {
  const term = String(query || "").trim().toLowerCase();
  if (!term) {
    return items;
  }

  return items.filter((item) => {
    const haystack = `${item.name || ""} ${item.text || ""}`.toLowerCase();
    return haystack.includes(term);
  });
}

export function paginateItems(items, page = 1, pageSize = 10) {
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    totalPages,
    total,
    pageSize: safePageSize,
  };
}
