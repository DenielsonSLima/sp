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
};
export const priceTableStore = remotePriceTables;
