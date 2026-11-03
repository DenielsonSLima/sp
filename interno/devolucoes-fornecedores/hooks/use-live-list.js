import { watchDomain } from '../realtime.js';
export function useLiveList(root, draw) {
  return watchDomain(root, async () => {
    if (!root.querySelector('.return-grid')) return;
    if (root.isConnected) await draw();
  });
}
