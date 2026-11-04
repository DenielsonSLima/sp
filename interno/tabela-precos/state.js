import { records as remote, runPriceTable } from "./services.js";
export { loadPriceTables } from "./queries.js";
const remotePriceTables = {
  list: () => remote.list(),
  get: (id) => remote.get(id),
  saveDraft: (id, input) => runPriceTable("saveDraft", id || null, { input }),
  send: (keys) => runPriceTable("send", null, { keys }),
  finalize: (keys) => runPriceTable("finalize", null, { keys }),
  reopen: (id) => runPriceTable("reopen", id, {}),
  archiveExpired: () => runPriceTable("archiveExpired", null, {}),
  restore: (id) => runPriceTable("restore", id, {}),
  createPromotion: (input) => runPriceTable("createPromotion", null, input),
  updatePromotion: (id, input) => runPriceTable("updatePromotion", id, input),
  addProducts: (id, productIds) => runPriceTable("addProducts", id, { productIds }),
  updateProduct: (id, itemId, input) => runPriceTable("updateProduct", id, { itemId, input }),
  removeProducts: (id, itemIds) => runPriceTable("removeProducts", id, { itemIds }),
  deletePromotion: async (id) => {
    const result = await runPriceTable("deletePromotion", id, {});
    remote.remove(id);
    return result;
  },
};
export const priceTableStore = remotePriceTables;
