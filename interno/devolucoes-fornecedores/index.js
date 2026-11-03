import { loadReturnDetail } from './queries.js';
import { frame } from './common.js';
import { renderList } from './list.js';
import { renderCreate } from './create.js';
import { renderDetail } from './detail.js';
export async function render(root) {
  const key = location.hash.split('/')[1];
  if (key && key !== 'nova') await loadReturnDetail(key);
  if (!root.isConnected) return;
  root.innerHTML = frame(!key);
  const content = root.querySelector('.return-content');
  if (key === 'nova') return renderCreate(content);
  if (key) return renderDetail(content, key);
  renderList(content);
}
