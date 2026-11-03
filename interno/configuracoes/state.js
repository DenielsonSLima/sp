import { settingsStore } from "./store.js";
import { resetSettingsOnContextChange } from "./realtime.js";

export { createSettingsStore } from "./store.js";
export { loadSettings } from "./queries.js";
export const { settings, saveCompany, saveWatermark, saveHeader, addUser, addProfile, updateUser, updateProfile } =
  settingsStore;
resetSettingsOnContextChange(settingsStore.reset);
