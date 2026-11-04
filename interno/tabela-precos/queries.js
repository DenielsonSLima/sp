import { records } from "./services.js";

// listRecords inside the shared API owns TanStack caching and request deduplication.
export const loadPriceTables = () => records.load();
export const readPriceTables = () => records.list();
export const getPriceTable = (id) => records.get(id);

import { readPriceTableProducts } from "./services.js";
import { readPriceTableProductPage, readPriceTableProductPreviews } from "./services.js";
import { loadTemplates } from "../cadastros/modelos-cartaz/model.js";

export async function loadPriceTableEditor() {
  const [products] = await Promise.all([readPriceTableProducts(), loadTemplates()]);
  return products;
}

export const loadPriceTablePage = (filters) => records.loadPage(filters);
export const loadPriceTableDetail = (id) => records.loadRecord(id);
export const rememberPriceTablePage = (items) => records.viewPage(items);
export const loadPriceTableProductPage = (filters) => readPriceTableProductPage(filters);
export const loadPriceTableProductPreviews = (rows, options) => readPriceTableProductPreviews(rows, options);
