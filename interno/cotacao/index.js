import { loadUnits } from '../cadastros/unidades/state.js';
import { loadQuote } from './queries.js';
import './tabs.js';
import { renderList } from './list.js';
import { renderWizard } from './wizard.js';
import { renderDetail } from './detail.js';
export async function render(root) {
  const key = location.hash.split('/')[1];
  root.innerHTML = '<p role="status">Carregando cotações…</p>';
  if (key === 'nova') return renderWizard(root);
  if (key) {
    await Promise.all([loadQuote(key), loadUnits()]);
    if (root.isConnected) return renderDetail(root, key);
    return;
  }
  if (root.isConnected) return renderList(root);
}
