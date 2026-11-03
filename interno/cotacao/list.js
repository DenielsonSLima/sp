import { openQuoteCreateDialog } from './create-dialog.js';
import { useLiveList } from './hooks/use-live-list.js';
import { usePagedList } from '../hooks/use-paged-list.js';
import { loadQuotePage } from './queries.js';
import { clearOnContextChange } from '../cadastros/remote.js';
import { notice, heading, escapeHtml, icon, dateLabel } from './common.js';
let stopRealtime, stopPage;
const filters = { status: 'open', query: '', category: '', start: '', end: '', page: 1 };
clearOnContextChange('quotes', () => {
  stopRealtime?.(); stopPage?.();
  Object.assign(filters, { status: 'open', query: '', category: '', start: '', end: '', page: 1 });
});

export async function renderList(root) {
  stopRealtime?.();
  stopPage?.();
  root.innerHTML =
    `<div class="quote-list-heading">${heading('OPERAÇÃO', 'Cotação')}<a class="button primary" href="#cotacao/nova">${icon('plus')} Nova cotação</a></div>` + notice +
    `<div class="quote-status-tabs module-tabs" role="group" aria-label="Situação da cotação"><button type="button" data-status="open" aria-pressed="${filters.status === 'open'}">Em andamento <span></span></button><button type="button" data-status="finished" aria-pressed="${filters.status === 'finished'}">Finalizados <span></span></button></div><section class="card quote-filters" aria-label="Filtros de cotação"><label>Busca<input type="search" name="query" placeholder="Cotação, produto ou fornecedor..." value="${escapeHtml(filters.query)}"></label><label>Categoria de produto<select name="category"><option value="">Todas</option></select></label><label>Data inicial<input name="start" type="date" value="${filters.start}"></label><label>Data final<input name="end" type="date" value="${filters.end}"></label><button class="button secondary clear-quotes" type="button">Limpar filtros</button></section><p class="quote-error" role="alert"></p><p class="catalog-count" role="status" aria-live="polite"></p><section class="catalog-grid quote-grid" aria-label="Cotações encontradas"></section>`;
  root.querySelector('a[href="#cotacao/nova"]').onclick = (event) => {
    event.preventDefault();
    openQuoteCreateDialog({ host: root, trigger: event.currentTarget });
  };
  let categorySignature = '';
  const page = usePagedList(root, {
    load: loadQuotePage, filters, grid: '.quote-grid', count: '.catalog-count', error: '.quote-error',
    formatCount: (result) => `${result.total} cotação(ões) · ${result.from}–${result.to}`,
    empty: '<div class="card catalog-empty"><h3>Nenhuma cotação encontrada.</h3><p>Ajuste os filtros ou crie uma nova cotação.</p></div>',
    card: (q) => `<a class="card quote-card" href="#cotacao/${q.id}"><div class="section-top"><span class="quote-icon">${icon('cotacao')}</span><span class="tag ${q.status === 'finished' ? 'tag-green' : ''}">${q.status === 'finished' ? 'Finalizada' : 'Em andamento'}</span></div><span class="quote-date">${dateLabel(q.date)}</span><h3>${escapeHtml(q.title)}</h3><p>${q.itemCount} produto(s) · ${q.providerCount} fornecedor(es)</p><div class="quote-progress"><span style="width:${q.itemCount ? (q.selectedCount / q.itemCount) * 100 : 0}%"></span></div><div class="quote-card-bottom"><span>${q.selectedCount}/${q.itemCount} escolhas feitas</span>${icon('arrow')}</div></a>`,
    onPage: (result) => {
      const categories = result.facets?.categories || [];
      const signature = JSON.stringify(categories);
      if (signature !== categorySignature) {
        categorySignature = signature;
        const select = root.querySelector('[name=category]');
        select.innerHTML = '<option value="">Todas</option>' + categories.map((category) => `<option>${escapeHtml(category)}</option>`).join('');
        select.value = filters.category;
      }
      root.querySelectorAll('[data-status]').forEach((button) => {
        const counts = result.facets?.statusCounts;
        button.querySelector('span').textContent = counts ? (counts[button.dataset.status] ?? 0) : '';
      });
    },
  });
  stopPage = page.dispose;
  root.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = () => {
      root.querySelectorAll('[data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      page.change({ status: button.dataset.status });
    };
  });
  root.querySelectorAll('.quote-filters input,.quote-filters select').forEach((input) => {
    input.addEventListener(input.type === 'search' ? 'input' : 'change', () =>
      page.change({ [input.name]: input.value }, { debounce: input.type === 'search' }));
  });
  root.querySelector('.clear-quotes').onclick = () => {
    for (const key of ['query', 'category', 'start', 'end']) root.querySelector(`[name="${key}"]`).value = '';
    page.change({ query: '', category: '', start: '', end: '' });
    root.querySelector('[name=query]').focus();
  };
  stopRealtime = useLiveList(root, page.refresh);
  await page.refresh();
}
