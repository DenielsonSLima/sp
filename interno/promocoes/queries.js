import { records } from "./services.js";

// listRecords inside the shared API owns TanStack caching and request deduplication.
export const loadCampaigns = () => records.load();
export const readCampaigns = () => records.list();
export const getCampaign = (id) => records.get(id);

import { readCampaignProducts } from "./services.js";
import { loadUnits } from "../cadastros/unidades/state.js";
import { loadTemplates } from "../cadastros/modelos-cartaz/model.js";

export async function loadCampaignEditor() {
  const [products] = await Promise.all([readCampaignProducts(), loadUnits(), loadTemplates()]);
  return products;
}

export const loadCampaignPage = (filters) => records.loadPage(filters);
export const loadCampaignDetail = (id) => records.loadRecord(id);
