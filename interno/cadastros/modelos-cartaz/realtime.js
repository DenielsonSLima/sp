import { watchResource, clearOnContextChange } from "../remote.js";
import { loadTemplates } from "./queries.js";
export function resetPosterTemplateContext(clear) {
  return clearOnContextChange("poster_templates", clear);
}
export function watchPosterTemplates(root, onRefresh) {
  return watchResource(root, "poster_templates", async () => {
    await loadTemplates();
    if (root.isConnected) await onRefresh();
  });
}
