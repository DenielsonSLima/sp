import { watchResource, watchResources, clearOnContextChange } from "../remote.js";
import { loadButcherModels } from "./queries.js";
export function resetButcherCatalogContext(clearModels, clearReceipts) {
  clearOnContextChange("butcher_models", clearModels);
  clearOnContextChange("butcher_receipts", clearReceipts);
}
export function watchButcherModels(root, onRefresh) {
  return watchResource(root, "butcher_models", async () => {
    await loadButcherModels();
    if (root.isConnected) await onRefresh();
  });
}

export const watchModelEditor = (root, refresh) => watchResources(root, ["butcher_models", "products", "product_categories", "units"], refresh);
