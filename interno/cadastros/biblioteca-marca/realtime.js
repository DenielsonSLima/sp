import { watchResources } from "../remote.js";
export { clearOnContextChange } from "../remote.js";
export function watchBrandLibrary(root, onRefresh) {
  return watchResources(root, ["brand_assets", "brand_categories"], onRefresh);
}
