import { renderList } from './views/list.js';
export async function render(root) {
  if (root.isConnected) renderList(root);
}
