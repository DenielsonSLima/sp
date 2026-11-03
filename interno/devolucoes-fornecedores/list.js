import { useLiveList } from './hooks/use-live-list.js';
import { usePagedList } from '../hooks/use-paged-list.js';
import { loadReturnPage } from './queries.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { money } from './state.js';
import { esc, base, dateLabel, badge } from './common.js';
let stopRealtime, stopPage;
const filters = { query: '', status: '', page: 1 };
clearOnContextChange('supplier_returns', () => {
  stopRealtime?.(); stopPage?.();
  Object.assign(filters, { query: '', status: '', page: 1 });
});

export function renderList(root) {
  stopRealtime?.();
  stopPage?.();
  root.innerHTML = `<section class="card return-filters" aria-label="Filtros de devoluções"><label>Buscar<input name="query" type="search" placeholder="Fornecedor, nota, produto ou motivo"></label><label>Situação<select name="status"><option value="">Todas as situações</option>${['Pendente', 'Parcial', 'Resolvida'].map((s) => `<option>${s}</option>`).join('')}</select></label></section><p class="return-error" role="alert"></p><p class="return-count" role="status" aria-live="polite"></p><div class="return-grid"></div>`;
  root.querySelector('[name=query]').value = filters.query;
  root.querySelector('[name=status]').value = filters.status;
  const page = usePagedList(root, {
    load: loadReturnPage, filters, grid: '.return-grid', count: '.return-count', error: '.return-error',
    formatCount: (result) => `${result.total} devolução(ões) · ${result.from}–${result.to}`,
    empty: '<div class="card return-empty"><h2>Nenhuma devolução encontrada</h2><p>Cadastre uma devolução ou ajuste a busca e a situação.</p></div>',
    card: (r) => `<a class="card return-card" href="${base}/${r.id}" aria-label="Abrir devolução ${esc(r.number)}">${badge(r.totals.status)}<h2>Devolução ${esc(r.number)}</h2><p>${esc(r.supplier.name)}<br>Nota de origem ${esc(r.originalInvoice)} · ${dateLabel(r.date)}</p><p>${r.itemCount} produto(s) · Total ${money(r.totals.total)}</p><div class="return-card-footer"><span>Saldo pendente</span><strong>${money(r.totals.pending)}</strong></div></a>`,
  });
  stopPage = page.dispose;
  root.querySelector('[name=query]').oninput = (event) => page.change({ query: event.target.value }, { debounce: true });
  root.querySelector('[name=status]').onchange = (event) => page.change({ status: event.target.value });
  stopRealtime = useLiveList(root, page.refresh);
  return page.refresh();
}
