import { watchResource, clearOnContextChange } from "../cadastros/remote.js";

export const watchCampaigns = (root, refresh) => watchResource(root, "campaigns", refresh);
export const clearCampaignDraftsOnContextChange = (clear) => clearOnContextChange("campaigns", clear);
