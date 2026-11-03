import { watchResources, clearOnContextChange } from '../cadastros/remote.js';
export const watchFlyerLibrary = (root, refresh) => watchResources(root, ['flyers'], refresh);
export const watchFlyerProducts = (root, refresh) => watchResources(root, ['products'], refresh);
export const clearFlyersOnSessionChange = (clear) => clearOnContextChange('flyers', clear);
