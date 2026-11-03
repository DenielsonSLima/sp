import { watchResource, clearOnContextChange } from "../cadastros/remote.js";

export const watchPriceTables = (root, refresh) => watchResource(root, "price_tables", refresh);
export const clearPriceTableDraftsOnContextChange = (clear) => clearOnContextChange("price_tables", clear);
