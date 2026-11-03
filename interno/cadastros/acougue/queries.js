import { isButcherProduct } from './product-filters.js';
import { replaceRows } from "../remote.js";
import { butcherCatalogService } from "./services.js";
import { resetButcherCatalogContext } from "./realtime.js";
export const models = [],
  receipts = [];
export async function loadButcherModels() {
  replaceRows(models, await butcherCatalogService.listModels());
  return structuredClone(models);
}
export async function loadButcherReceipts() {
  replaceRows(receipts, await butcherCatalogService.listReceipts());
  return structuredClone(receipts);
}
resetButcherCatalogContext(
  () => models.splice(0),
  () => receipts.splice(0),
);

export const loadModelProducts = async () => (await butcherCatalogService.listProducts()).filter(isButcherProduct);
export const loadModelPreviews = (rows, options) => butcherCatalogService.loadPreviews(rows, options);
