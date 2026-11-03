import { settingsStore } from "./store.js";

export const loadSettings = (keys) => settingsStore.loadSettings(keys);
// Each route reads only the resources it displays; shared API owns the cache.
export const loadCompanySettings = () => loadSettings(["company"]);
export const loadProfileSettings = () => loadSettings(["profiles"]);
export const loadUserSettings = () => loadSettings(["users", "profiles"]);
export const loadWatermarkSettings = () => loadSettings(["watermark"]);
export const loadHeaderSettings = () => loadSettings(["header", "company"]);
