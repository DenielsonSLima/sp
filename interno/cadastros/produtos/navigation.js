import { compactFilter, filterValues } from "../../../shared/filters.js";

export function normalizeProductList(state = {}) {
  const page = Number(state.page);
  return {
    query: String(state.query || ""),
    category: compactFilter(state.category),
    ...(filterValues(state.subcategory).length ? { subcategory: compactFilter(state.subcategory) } : {}),
    view: state.view === "table" ? "table" : "cards",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function productRoute(hash) {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  let id = "";
  try {
    id = decodeURIComponent(path.split("/")[2] || "");
  } catch {}
  const result = { id, query: params.get("q") || "", category: compactFilter(params.getAll("category")) };
  if (params.get("subcategory")) result.subcategory = compactFilter(params.getAll("subcategory"));
  if (params.has("view") || params.has("page")) {
    const state = normalizeProductList({ view: params.get("view"), page: params.get("page") });
    Object.assign(result, { view: state.view, page: state.page });
  }
  return result;
}
export function productHref(id = "", filters = {}) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  for (const value of filterValues(filters.category)) params.append("category", value);
  for (const value of filterValues(filters.subcategory)) params.append("subcategory", value);
  if (filters.view !== undefined || filters.page !== undefined) {
    const state = normalizeProductList(filters);
    params.set("view", state.view);
    params.set("page", String(state.page));
  }
  return `#cadastros/produtos${id ? "/" + encodeURIComponent(id) : ""}${params.size ? "?" + params : ""}`;
}
export function paginateProducts(items, state = {}) {
  const normalized = normalizeProductList(state),
    perPage = normalized.view === "table" ? 25 : 20,
    pages = Math.max(1, Math.ceil(items.length / perPage)),
    page = Math.min(normalized.page, pages),
    start = (page - 1) * perPage;
  return {
    page,
    pages,
    perPage,
    items: items.slice(start, start + perPage),
    from: items.length ? start + 1 : 0,
    to: Math.min(start + perPage, items.length),
    total: items.length,
  };
}
export function changeProductList(state, patch) {
  const next = normalizeProductList({ ...state, ...patch });
  if (
    ["query", "category", "subcategory", "view"].some(
      (key) => Object.hasOwn(patch, key) && JSON.stringify(next[key]) !== JSON.stringify(normalizeProductList(state)[key]),
    )
  )
    next.page = 1;
  return next;
}
