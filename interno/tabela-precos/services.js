import { createOperationalStore } from "../operational-store.js";

// One RPC-backed store. Views subscribe explicitly through realtime.js.
export const records = createOperationalStore("price_tables", undefined, { realtime: false });
export const runPriceTable = (action, id, payload = {}) => records.run(action, id, payload);

export { getDataContext } from "../../shared/data/api.js";
export { listProductMetadata as readPriceTableProducts } from "../../shared/data/api.js";
