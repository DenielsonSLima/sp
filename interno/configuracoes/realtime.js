import { watchResource, clearOnContextChange } from "../cadastros/remote.js";
import { settingResources } from "./store.js";

export const watchSetting = (root, resource, refresh) => watchResource(root, resource, refresh);
export function resetSettingsOnContextChange(clear) {
  const stops = Object.values(settingResources).map((resource) => clearOnContextChange(resource, clear));
  return () => stops.forEach((stop) => stop());
}
