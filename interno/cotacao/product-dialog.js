import { escapeHtml } from '../../shared/ui.js';
import { unitLabel } from '../cadastros/unidades/state.js';
import { quoteProductPhoto } from './presentation.js';
import { filterPickerProducts, productPickerOptions } from './product-picker.js';

export function openQuoteProductDialog({
  host, products, items, draft, trigger, onSubmit, onClose = () => {}, loadPreviews,
}) {
  const existing = host.querySelector('.quote-product-dialog');
  if (existing) return existing;
  let available = products.filter((product) => !items.some((item) => item.productId === product.id));
  draft.products ??= draft.product ? [draft.product] : [];
  draft.products = draft.products.filter((id) => available.some((row) => row.id === id));
  draft.quantity ??= '1';
  const selected = new Set(draft.products);
  const dialog = document.createElement('dialog');
  const events = new AbortController();
  let settled = false, submitting = false, drawVersion = 0, visibleCount = 20;
  const previousOverflow = document.body.style.overflow;
  draft.open = true;
  dialog.className = 'quote-product-dialog';
  dialog.setAttribute('aria-labelledby', 'quote-product-dialog-title');
  dialog.setAttribute('aria-describedby', 'quote-product-dialog-description');
  dialog.innerHTML = `<form class="quote-add-product"><header class="quote-product-dialog-heading"><div><h2 id="quote-product-dialog-title">Adicionar produtos à cotação</h2><p id="quote-product-dialog-description">Marque os produtos e adicione todos de uma vez.</p></div><button type="button" class="quote-product-dialog-close" data-close aria-label="Fechar seleção de produtos">×</button></header><div class="quote-picker-filters"><label class="quote-product-search">Buscar produto<input type="search" data-search placeholder="Nome, código ou categoria" value="${escapeHtml(draft.query || '')}"></label><label>Categoria<select name="category" data-searchable="true" aria-label="Categoria dos produtos"></select></label><label>Subcategoria<select name="subcategory" data-searchable="true" aria-label="Subcategoria dos produtos"></select></label></div><div class="quote-picker-selection"><label><input type="checkbox" data-select-all><span data-select-all-label>Selecionar todos os resultados</span></label><span data-selection-count role="status"></span></div><fieldset class="quote-product-options"><legend class="visually-hidden">Produtos disponíveis</legend><div class="quote-product-picker"></div></fieldset><button type="button" class="button secondary quote-picker-more" data-more hidden>Mostrar mais produtos</button><label class="quote-product-quantity">Quantidade de cada produto<input name="quantity" inputmode="decimal" value="${escapeHtml(draft.quantity)}" required></label><p class="quote-error" role="alert"></p><footer class="quote-product-dialog-actions"><button type="button" class="button secondary cancel-add-product" data-cancel>Cancelar</button><button type="submit" class="button primary">Adicionar selecionados</button></footer></form>`;
  const form = dialog.querySelector('form'), search = dialog.querySelector('[data-search]'),
    quantity = form.elements.quantity, category = form.elements.category, subcategory = form.elements.subcategory,
    submit = dialog.querySelector('[type=submit]'), all = dialog.querySelector('[data-select-all]'),
    count = dialog.querySelector('[data-selection-count]'), more = dialog.querySelector('[data-more]'),
    error = dialog.querySelector('.quote-error');
  const optionsMarkup = (rows, value, label) => `<option value="">${label}</option>` + rows
    .map((row) => `<option value="${escapeHtml(row.value)}" ${row.value === value ? 'selected' : ''}>${escapeHtml(row.label)}</option>`).join('');
  category.innerHTML = optionsMarkup(productPickerOptions(available).categories, draft.category, 'Todas as categorias');
  category.value = draft.category || '';
  const subcategories = () => {
    const rows = productPickerOptions(available, category.value).subcategories;
    if (!rows.some((row) => row.value === draft.subcategory)) draft.subcategory = '';
    subcategory.innerHTML = optionsMarkup(rows, draft.subcategory, 'Todas as subcategorias');
    subcategory.value = draft.subcategory || '';
  };
  subcategories();
  const capture = () => {
    draft.products = [...selected];
    draft.product = '';
    draft.quantity = quantity.value;
    draft.query = search.value;
    draft.category = category.value;
    draft.subcategory = subcategory.value;
  };
  const matchedRows = () => filterPickerProducts(available, {
    query: search.value, category: category.value, subcategory: subcategory.value,
  });
  const selectionStatus = () => {
    const matched = matchedRows();
    count.textContent = `${selected.size} produto(s) selecionado(s)`;
    all.checked = matched.length > 0 && matched.every((row) => selected.has(row.id));
    all.indeterminate = !all.checked && matched.some((row) => selected.has(row.id));
    all.disabled = submitting || !matched.length;
    dialog.querySelector('[data-select-all-label]').textContent = `Selecionar todos os ${matched.length} resultados`;
    submit.disabled = submitting || !selected.size;
    submit.textContent = submitting ? 'Adicionando…' : `Adicionar selecionados (${selected.size})`;
  };
  const draw = () => {
    const matched = matchedRows(), rows = matched.slice(0, visibleCount), version = ++drawVersion;
    dialog.querySelector('.quote-product-picker').innerHTML = rows.length ? rows.map((product) =>
      `<label class="quote-product-option"><input type="checkbox" name="product" value="${escapeHtml(product.id)}" ${selected.has(product.id) ? 'checked' : ''}><span class="quote-photo-slot" data-picker-photo="${escapeHtml(product.id)}">${quoteProductPhoto(product)}</span><span class="quote-product-option-text"><strong>${escapeHtml(product.name)}</strong><small>${product.code ? `Cód. ${escapeHtml(product.code)} · ` : ''}${escapeHtml(product.category)}${product.subcategory ? ` · ${escapeHtml(product.subcategory)}` : ''} · ${escapeHtml(unitLabel(product.unit))}</small></span></label>`).join('')
      : `<p class="quote-product-empty">${available.length ? 'Nenhum produto encontrado com esses filtros.' : 'Todos os produtos cadastrados já estão na cotação.'}</p>`;
    dialog.querySelectorAll('[name=product]').forEach((input) => {
      input.onchange = () => {
        if (input.checked) selected.add(input.value); else selected.delete(input.value);
        capture(); selectionStatus(); error.textContent = '';
      };
    });
    more.hidden = matched.length <= rows.length;
    selectionStatus();
    if (loadPreviews && rows.length) void (async () => {
      for (let start = 0; start < rows.length && !settled && version === drawVersion; start += 20) {
        await loadPreviews(rows.slice(start, start + 20), {
          isCurrent: () => !settled && version === drawVersion,
          onBatch: (batch) => {
            if (settled || version !== drawVersion) return;
            const byId = new Map(batch.map((row) => [row.id, row]));
            for (const node of dialog.querySelectorAll('[data-picker-photo]')) {
              const row = byId.get(node.dataset.pickerPhoto);
              if (row) node.innerHTML = quoteProductPhoto(row);
            }
          },
        });
      }
    })().catch((cause) => {
      if (!settled && version === drawVersion) error.textContent = 'Algumas fotos não carregaram. ' + cause.message;
    });
  };
  const finish = (reason) => {
    if (settled) return;
    capture(); settled = true; events.abort();
    if (reason === 'navigation') draft.open = Boolean(selected.size || draft.quantity !== '1');
    else Object.assign(draft, { open: false, product: '', products: [], quantity: '1', query: '', category: '', subcategory: '' });
    if (dialog.open) dialog.close();
    dialog.remove(); document.body.style.overflow = previousOverflow;
    if (reason !== 'navigation' && trigger?.isConnected) trigger.focus({ preventScroll: true });
    onClose(reason);
  };
  const cancel = () => { if (!submitting) finish('cancel'); };
  dialog.querySelector('[data-close]').onclick = cancel;
  dialog.querySelector('[data-cancel]').onclick = cancel;
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); event.stopPropagation(); cancel(); });
  dialog.addEventListener('close', () => finish('navigation'));
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cancel();
  });
  form.addEventListener('input', capture);
  search.oninput = () => { capture(); visibleCount = 20; draw(); };
  category.onchange = () => { draft.subcategory = ''; subcategories(); capture(); visibleCount = 20; draw(); };
  subcategory.onchange = () => { capture(); visibleCount = 20; draw(); };
  all.onchange = () => {
    for (const row of matchedRows()) { if (all.checked) selected.add(row.id); else selected.delete(row.id); }
    capture(); draw();
  };
  more.onclick = () => { visibleCount += 20; draw(); };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting || settled) return;
    capture();
    const rows = available.filter((row) => selected.has(row.id));
    if (!rows.length) { error.textContent = 'Selecione pelo menos um produto cadastrado.'; return; }
    submitting = true; error.textContent = '';
    form.querySelectorAll('button,input,select').forEach((node) => (node.disabled = true));
    form.setAttribute('aria-busy', 'true');
    let added = 0;
    try {
      for (const product of rows) {
        if (settled) return;
        await onSubmit(product, draft.quantity);
        selected.delete(product.id);
        available = available.filter((row) => row.id !== product.id);
        draft.products = [...selected];
        if (settled) draft.open = Boolean(selected.size || draft.quantity !== '1');
        added++;
        if (!settled) count.textContent = `${added} de ${rows.length} produto(s) adicionado(s)…`;
      }
      if (!settled) finish('saved');
    } catch (cause) {
      if (!settled) error.textContent = (added ? `${added} produto(s) já adicionado(s). Os restantes continuam selecionados. ` : '') + cause.message;
    } finally {
      submitting = false;
      if (!settled) {
        form.querySelectorAll('button,input,select').forEach((node) => (node.disabled = false));
        form.setAttribute('aria-busy', 'false');
        draw();
      }
    }
  };
  window.addEventListener('hashchange', () => finish('navigation'), { signal: events.signal });
  host.append(dialog); draw(); document.body.style.overflow = 'hidden'; dialog.showModal(); search.focus();
  return dialog;
}
