import { createOperationalStore } from "../operational-store.js";

// One RPC-backed store. Views subscribe explicitly through realtime.js.
export const records = createOperationalStore("campaigns", undefined, { realtime: false });
export const runCampaign = (action, id, payload = {}) => records.run(action, id, payload);

export { getDataContext } from "../../shared/data/api.js";
export { listProductMetadata as readCampaignProducts } from "../../shared/data/api.js";
