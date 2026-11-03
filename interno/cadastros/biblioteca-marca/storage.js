// Compatibility entry point used by editors and operational modules.
export { listAssets, listCategories } from "./queries.js";
export {
  createBrandAssetStorage,
  getAsset,
  updateAsset,
  deleteAsset,
  addAsset,
  addCategory,
  renameCategory,
  removeCategory,
} from "./services.js";
