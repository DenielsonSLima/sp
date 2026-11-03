import { loadPartners } from '../cadastros/parceiros/state.js';
import { loadUnits } from '../cadastros/unidades/state.js';
import { loadHortifrutiDetail } from './queries.js';
import { heading, base } from './common.js';
import { renderList } from './list.js';
import { renderDetail } from './detail.js';
export async function render(root) {
  const key = location.hash.split('/')[1];
  await Promise.all([
    ...(key && key !== 'nova' ? [loadHortifrutiDetail(key)] : []),
    ...(key ? [loadPartners()] : []),
    ...(key && key !== 'nova' ? [loadUnits()] : []),
  ]);
  if (!root.isConnected) return;
  const title = heading('OPERAÇÃO', 'Hortifruti');
  root.innerHTML = `<link rel="stylesheet" href="./interno/hortifruti/styles.css"><section class="hortifruti">${key ? title : `<div class="page-heading-actions">${title}<a class="button primary" href="${base}/nova">+ Nova compra</a></div>`}<div class="hf-content"></div></section>`;
  const content = root.querySelector('.hf-content');
  if (key) return renderDetail(content, key);
  renderList(content);
}
