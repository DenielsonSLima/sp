import { watchResources } from '../cadastros/remote.js';
import { loadReceiptModels } from './queries.js';
export const watchDomain = (root, refresh) => watchResources(root, ['butcher_receipts'], refresh);
export const watchReceiptModels = (root, refresh) => watchResources(root, ['butcher_models'], async () => {
  await loadReceiptModels();
  if (root.isConnected) await refresh();
});
