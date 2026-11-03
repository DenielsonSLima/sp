import { watchResource, watchResources, clearOnContextChange } from "../remote.js";
export const clearProductDrafts = (clear) => clearOnContextChange("products", clear);
export const watchProductChanges = (root, onRefresh) => watchResource(root, "products", onRefresh);
export const watchProductCatalog = (root, onRefresh) =>
  watchResources(root, ["products", "product_categories"], onRefresh);
