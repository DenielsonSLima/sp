import { resourceError } from "../remote.js";
import { loadUnits } from "../unidades/queries.js";
import { loadProductCategories } from "../categorias/queries.js";
import { productRoute, normalizeProductList } from "./navigation.js";

export async function render(root) {
  try {
    await Promise.all([loadUnits(), loadProductCategories()]);
  } catch (error) {
    resourceError(root, error);
    return;
  }
  if (!root.isConnected) return;
  const route = productRoute(location.hash),
    filters = normalizeProductList(route);
  if (route.id) {
    const { renderDetail } = await import("./detail.js");
    if (root.isConnected) return renderDetail(root, route.id, filters);
  } else {
    const { renderList } = await import("./list.js");
    if (root.isConnected) return renderList(root, filters);
  }
}
