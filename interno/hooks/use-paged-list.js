/** Small server pages; keep mounted cards while a refresh is in progress. */
export function usePagedList(root, {
  load, filters = {}, grid, count, error, card, empty = '<p>Nenhum registro encontrado.</p>',
  pagination, onPage = () => {}, formatCount = (page) => `${page.total} registro(s)`, current = () => true,
}) {
  const resolve = (value) => typeof value === 'string' ? root.querySelector(value) : value;
  const host = resolve(grid), counter = resolve(count), feedback = resolve(error);
  let pager = resolve(pagination), disposed = false, version = 0, timer = null, lastPage = null;
  const nodes = new Map();
  Object.assign(filters, { page: filters.page || 1, perPage: filters.perPage || 20 });
  if (!pager) {
    pager = document.createElement('nav');
    pager.setAttribute('aria-label', 'Páginas dos resultados');
    host.after(pager);
  }
  pager.classList.add('paged-list-pagination');
  pager.innerHTML = '<button class="button secondary" type="button" data-page-prev>Anterior</button> <span data-page-label aria-live="polite"></span> <button class="button secondary" type="button" data-page-next>Próxima</button> <button class="button secondary" type="button" data-page-retry hidden>Tentar novamente</button>';
  const previous = pager.querySelector('[data-page-prev]'), next = pager.querySelector('[data-page-next]');
  const retry = pager.querySelector('[data-page-retry]'), label = pager.querySelector('[data-page-label]');
  const updatePager = ({ loading = false, failed = false } = {}) => {
    const hasPages = !failed && lastPage?.pages > 1;
    pager.hidden = !hasPages && !failed;
    previous.hidden = next.hidden = label.hidden = !hasPages;
    retry.hidden = !failed;
    previous.disabled = loading || !hasPages || lastPage.page <= 1;
    next.disabled = loading || !hasPages || lastPage.page >= lastPage.pages;
    label.textContent = hasPages ? `Página ${lastPage.page} de ${lastPage.pages}` : '';
  };
  updatePager();
  const active = () => !disposed && root.isConnected && host.isConnected && root.contains(host) && current();
  const draw = (rows) => {
    const remaining = new Set(nodes.keys());
    if (!rows.length) {
      host.innerHTML = empty;
      nodes.clear();
      return;
    }
    if (!nodes.size) host.replaceChildren();
    rows.forEach((row, index) => {
      const id = String(row.id), html = card(row);
      let entry = nodes.get(id);
      if (!entry || entry.html !== html) {
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        const node = template.content.firstElementChild;
        if (!node) throw Error('Não foi possível apresentar este registro.');
        if (entry) entry.node.replaceWith(node);
        entry = { node, html };
        nodes.set(id, entry);
      }
      const position = host.children[index];
      if (position !== entry.node) host.insertBefore(entry.node, position || null);
      remaining.delete(id);
    });
    for (const id of remaining) {
      nodes.get(id).node.remove();
      nodes.delete(id);
    }
  };
  const refresh = async () => {
    clearTimeout(timer);
    if (!active()) return;
    const request = ++version;
    host.setAttribute('aria-busy', 'true');
    updatePager({ loading: true });
    if (feedback) feedback.textContent = '';
    try {
      const page = await load({ ...filters });
      if (!active() || request !== version) return;
      filters.page = page.page;
      draw(page.items);
      host.inert = false;
      if (counter) counter.textContent = formatCount(page);
      lastPage = page;
      updatePager();
      onPage(page);
      return page;
    } catch (failure) {
      if (active() && request === version) {
        if (feedback) feedback.textContent = failure.message;
        updatePager({ failed: true });
      }
    } finally {
      if (active() && request === version) host.removeAttribute('aria-busy');
    }
  };
  const change = (patch, { debounce = false } = {}) => {
    Object.assign(filters, { page: 1 }, patch);
    version++;
    clearTimeout(timer);
    host.inert = true;
    host.setAttribute('aria-busy', 'true');
    updatePager({ loading: true });
    if (feedback) feedback.textContent = '';
    if (debounce) timer = setTimeout(refresh, 250);
    else return refresh();
  };
  previous.onclick = () => change({ page: Math.max(1, filters.page - 1) });
  next.onclick = () => change({ page: filters.page + 1 });
  retry.onclick = refresh;
  const observer = new MutationObserver(() => { if (!active()) dispose(); });
  observer.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    disposed = true;
    version++;
    clearTimeout(timer);
    observer.disconnect();
  }
  return { refresh, change, dispose };
}
