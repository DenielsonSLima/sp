import { watchResource, clearOnContextChange } from "../remote.js";
import { loadPartners } from "./queries.js";

export function resetPartnerContext(clear) {
  return clearOnContextChange("partners", clear);
}
export function watchPartners(root, onRefresh) {
  return watchResource(root, "partners", async () => {
    await loadPartners();
    if (root.isConnected) await onRefresh();
  });
}
