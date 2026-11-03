import { esc, stamp, dateText, chrome, receiptMarkup } from '../common.js';
import { renderList } from './list.js';
import { loadReceipt } from '../queries.js';
const requests = new WeakMap();
export async function renderDetail(root, id) {
  const previousView = root.firstElementChild;
  const request = (requests.get(root) || 0) + 1;
  requests.set(root, request);
  const current = () => root.isConnected && root.firstElementChild === previousView && requests.get(root) === request;
  let receipt;
  try {
    receipt = await loadReceipt(id);
  } catch (error) {
    if (current()) {
      const status = root.querySelector('[role=status]');
      if (status) status.textContent = error.message;
    }
    return;
  }
  if (!current()) return;
  if (!receipt) return renderList(root);
  root.innerHTML = `${chrome()}<div class="butcher-toolbar"><div><h2 tabindex="-1">${esc(receipt.reference || 'Recebimento de ' + receipt.category)}</h2><p>Recebido em ${dateText(receipt.receivedDate)} · registrado em ${esc(stamp(receipt.createdAt))}</p></div><button class="button secondary back-receipts" type="button">← Voltar para lista</button></div><p class="butcher-help">Alterações nos modelos não modificam esta distribuição registrada.</p>${receiptMarkup(receipt)}`;
  root.querySelector('.back-receipts').onclick = () => renderList(root, id);
  root.querySelector('.butcher-toolbar h2').focus();
}
