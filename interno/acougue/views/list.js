import { state } from '../state.js';
import { esc, kg, percent, dateText, chrome } from '../common.js';
import { loadReceiptPage } from '../queries.js';
import { usePagedList } from '../../hooks/use-paged-list.js';
import { renderDetail } from './detail.js';
import { renderCreate } from './create.js';
import { openReceiptDialog } from './create-dialog.js';
import { useLiveList } from '../hooks/use-live-list.js';
let stopRealtime, stopPage;

export function renderList(root, focusId = '') {
  stopRealtime?.();
  stopPage?.();
  root.innerHTML = `${chrome('<div class="butcher-actions"><a class="button secondary" href="#cadastros/acougue">Gerenciar modelos →</a><button class="button primary add-receipt" type="button">Novo</button></div>')}<section class="card butcher-receipt-filters" aria-label="Filtrar recebimentos"><label>Buscar<input type="search" name="query" value="${esc(state.filters.query)}" placeholder="Identificação, categoria ou modelo..."></label><label>Data inicial<input type="date" name="start" value="${esc(state.filters.start)}"></label><label>Data final<input type="date" name="end" value="${esc(state.filters.end)}"></label><button class="button secondary clear-receipt-filters" type="button">Limpar filtros</button></section><p class="butcher-status" role="alert">${esc(state.listMessage)}</p><p class="butcher-receipt-count" role="status" aria-live="polite"></p><section class="butcher-receipts-grid" aria-label="Recebimentos encontrados"></section><nav class="butcher-pagination" aria-label="Páginas de recebimentos"></nav>`;
  state.filters.perPage = 12;
  const page = usePagedList(root, {
    load: loadReceiptPage, filters: state.filters, grid: '.butcher-receipts-grid', count: '.butcher-receipt-count',
    error: '.butcher-status', pagination: '.butcher-pagination',
    formatCount: (result) => `${result.total} recebimento(s) encontrado(s) · ${result.from}–${result.to} exibidos`,
    empty: '<div class="card butcher-empty"><h2>Nenhum recebimento encontrado.</h2><p>Altere a busca ou clique em Novo para começar.</p></div>',
    card: (r) => `<article class="card butcher-receipt-card"><div class="butcher-model-tags"><span class="butcher-part-badge">${esc(r.category)}</span><span>${dateText(r.receivedDate)}</span></div><h2>${esc(r.reference || 'Recebimento de ' + r.category)}</h2><strong class="receipt-weight">${kg(r.weightGrams)} <small>kg</small></strong><p>${r.animalCount ?? 1} animal(is) no lote</p><p>${esc(r.modelName)} · versão ${r.modelVersion}</p><p>${r.rowCount} parte(s) · ${percent(r.totalBps)}% distribuídos</p><button class="button secondary receipt-open" data-id="${r.id}" type="button" aria-label="Ver detalhes de ${esc(r.reference || 'recebimento de ' + r.category)} em ${dateText(r.receivedDate)}">Ver detalhes →</button></article>`,
    onPage: () => {
      root.querySelectorAll('.receipt-open').forEach((button) => {
        button.onclick = () => renderDetail(root, button.dataset.id);
      });
      if (focusId) {
        root.querySelector(`.receipt-open[data-id="${focusId}"]`)?.focus();
        focusId = '';
      }
    },
  });
  stopPage = page.dispose;
  root.querySelectorAll('.butcher-receipt-filters input').forEach((input) => {
    input.addEventListener(input.type === 'search' ? 'input' : 'change', () =>
      page.change({ [input.name]: input.value }, { debounce: input.type === 'search' }));
  });
  root.querySelector('.clear-receipt-filters').onclick = () => {
    root.querySelectorAll('.butcher-receipt-filters input').forEach((input) => { input.value = ''; });
    page.change({ query: '', start: '', end: '' });
    root.querySelector('[name=query]').focus();
  };
  root.querySelector('.add-receipt').onclick = () => openReceiptDialog(root, {
    onContinue: () => { stopRealtime?.(); stopPage?.(); renderCreate(root); },
  });
  stopRealtime = useLiveList(root, page.refresh);
  return page.refresh();
}
