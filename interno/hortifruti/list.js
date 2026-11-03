import { useLiveList } from './hooks/use-live-list.js';
import { usePagedList } from '../hooks/use-paged-list.js';
import { loadHortifrutiPage } from './queries.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { esc, base, badge, money, dateLabel } from './common.js';
let stopRealtime, stopPage;
const filters = { status: 'pending', query: '', start: '', end: '', page: 1 };
clearOnContextChange('hortifruti_receipts', () => {
  stopRealtime?.(); stopPage?.();
  Object.assign(filters, { status: 'pending', query: '', start: '', end: '', page: 1 });
});

export function renderList(root) {
  stopRealtime?.();
  stopPage?.();
  root.innerHTML = `<div class="hf-tabs module-tabs" role="group" aria-label="Situação das compras"><button type="button" data-status="pending" aria-pressed="${filters.status === 'pending'}">Pendentes</button><button type="button" data-status="finished" aria-pressed="${filters.status === 'finished'}">Finalizadas</button></div><section class="card hf-filters" aria-label="Filtros"><label>Buscar<input type="search" name="query" placeholder="Parceiro, produto ou observação"></label><label>Data inicial<input type="date" name="start"></label><label>Data final<input type="date" name="end"></label><button class="button secondary" type="button" data-clear>Limpar filtros</button></section><p class="hf-error" role="alert"></p><p class="hf-count" role="status" aria-live="polite"></p><div class="hf-grid"></div>`;
  root.querySelectorAll('input').forEach((input) => { input.value = filters[input.name]; });
  const page = usePagedList(root, {
    load: loadHortifrutiPage, filters, grid: '.hf-grid', count: '.hf-count', error: '.hf-error',
    formatCount: (result) => `${result.total} compra(s) · ${result.from}–${result.to}`,
    empty: '<section class="card hf-empty"><h2>Nenhuma compra encontrada</h2><p>Crie uma compra ou ajuste os filtros.</p></section>',
    card: (r) => {
      const s = r.summary;
      return `<a class="card hf-card" href="${base}/${r.id}"><div class="hf-toolbar">${badge(r.status)}<span>${dateLabel(r.date)}</span></div><h2>${esc(r.partner.name)}</h2><p>${r.itemCount} produto(s) · ${!r.itemCount ? 'Aguardando seleção' : r.entryConfirmed ? 'Entrada confirmada' : r.weighed ? 'Aguardando entrada' : 'Aguardando pesagem'}</p><p>${esc(r.itemNames.join(', '))}${r.itemCount > r.itemNames.length ? '…' : ''}</p><div class="hf-card-total"><span>${s.total === null ? 'Custo a informar' : s.incomplete ? 'Subtotal informado · há itens a conferir' : 'Total da compra'}</span><strong>${money(s.total)}</strong></div></a>`;
    },
  });
  stopPage = page.dispose;
  root.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = () => {
      root.querySelectorAll('[data-status]').forEach((el) => el.setAttribute('aria-pressed', String(el === button)));
      page.change({ status: button.dataset.status });
    };
  });
  root.querySelectorAll('input').forEach((input) => {
    input.addEventListener(input.type === 'search' ? 'input' : 'change', () =>
      page.change({ [input.name]: input.value }, { debounce: input.type === 'search' }));
  });
  root.querySelector('[data-clear]').onclick = () => {
    root.querySelectorAll('input').forEach((input) => { input.value = ''; });
    page.change({ query: '', start: '', end: '' });
  };
  stopRealtime = useLiveList(root, page.refresh);
  return page.refresh();
}
