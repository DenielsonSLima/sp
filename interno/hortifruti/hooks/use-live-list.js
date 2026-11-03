import { watchDomain } from '../realtime.js';
export function useLiveList(root, draw) {
  return watchDomain(root, async () => {
    if (!root.querySelector('.hf-grid')) return;
    if (root.isConnected) await draw();
  });
}
