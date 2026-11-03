import { watchDomain } from '../realtime.js';
export function useLiveList(root, draw) {
  return watchDomain(root, async () => {
    if (!root.querySelector('.quote-grid')) return;
    if (root.isConnected) await draw();
  });
}
