import { listRecords, saveRecord } from "../../../shared/data/api.js";
export const productCategoryService = {
  list: () => listRecords("product_categories"),
  save: (input) => saveRecord("product_categories", input, { expectedVersion: input._version }),
};
