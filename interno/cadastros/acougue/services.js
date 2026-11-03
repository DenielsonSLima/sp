import { listRecords, listResourcePage, getRecord, listProductMetadata, loadProductPreviews, saveRecord, calculate, command } from "../../../shared/data/api.js";
export const butcherCatalogService = {
  loadPreviews: (rows, options) => loadProductPreviews(rows, options),
  listProducts: () => listProductMetadata(),
  listModels: () => listRecords("butcher_models"),
  listReceipts: () => listRecords("butcher_receipts"),
  receiptPage: (filters) => listResourcePage("butcher_receipts", filters),
  receipt: (id) => getRecord("butcher_receipts", id),
  saveModel: (input) => {
    const record = { ...input };
    if (!record.sourceId) delete record.sourceId;
    return saveRecord("butcher_models", record, { expectedVersion: input._version });
  },
  setCurrent: (id, version) => saveRecord("butcher_models", { id, action: "setCurrent" }, { expectedVersion: version }),
  toggle: (id, confirmCurrent, version) =>
    saveRecord("butcher_models", { id, action: "toggle", confirmCurrent }, { expectedVersion: version }),
  estimate: (input) => calculate("butcher", input),
  weighModel: (input) => calculate("butcher_model_weighing", input),
  createReceipt: (input) => command("butcher_receipts", "create", null, input),
};
