import { watchResource, clearOnContextChange } from "../remote.js";
import { loadUnits } from "./queries.js";

export function resetUnitContext(clear) {
  return clearOnContextChange("units", clear);
}
export function watchUnits(root, onRefresh) {
  return watchResource(root, "units", async () => {
    await loadUnits();
    if (root.isConnected) await onRefresh();
  });
}
