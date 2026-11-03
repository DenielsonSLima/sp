import { watchResource, clearOnContextChange } from "../remote.js";
import { loadProductCategories } from "./queries.js";
export function resetCategoryContext(clear) {
  return clearOnContextChange("product_categories", clear);
}
export function watchProductCategories(root, onRefresh) {
  return watchResource(root, "product_categories", async () => {
    await loadProductCategories();
    if (root.isConnected) await onRefresh();
  });
}
