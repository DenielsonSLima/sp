import { watchDomain } from '../realtime.js';
export function useLiveList(root, draw) {
  return watchDomain(root, async () => {
    if (!root.querySelector('.butcher-receipts-grid')) return;
    if (root.isConnected) await draw();
  });
}
