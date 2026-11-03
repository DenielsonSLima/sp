import { escapeHtml } from '../../../shared/ui.js';
import { getDataContext } from '../../../shared/data/api.js';
import { quoteProductPhoto } from '../presentation.js';
import { readQuoteProducts, readQuotePreviews } from '../services.js';

export function useProductPhotos(root, quote, { isCurrent }) {
  const scope = getDataContext(),
    catalog = new Map();
  let catalogRequest = null,
    photoRequest = null;
  const current = () =>
    root.isConnected &&
    isCurrent() &&
    scope?.companyId === getDataContext()?.companyId &&
    scope?.user?.id === getDataContext()?.user?.id;
  const loadCatalog = () =>
    (catalogRequest ??= readQuoteProducts()
      .then((rows) => {
        if (!current()) throw Error('A cotação ou empresa ativa mudou durante o carregamento.');
        rows.forEach((row) => catalog.set(row.id, row));
        return rows;
      })
      .catch((error) => {
        catalogRequest = null;
        throw error;
      }));
  const renderPhotos = () => {
    if (!current()) return;
    for (const node of root.querySelectorAll('[data-quote-photo]')) {
      const product = catalog.get(node.dataset.quotePhoto);
      if (product) node.innerHTML = quoteProductPhoto(product);
    }
  };
  async function loadPhotos() {
    if (!quote.items.length || !current()) return;
    await loadCatalog();
    const rows = quote.items.map((item) => catalog.get(item.productId)).filter(Boolean);
    for (let index = 0; index < rows.length && current(); index += 25) {
      await readQuotePreviews(rows.slice(index, index + 25), {
        isCurrent: current,
        onBatch: (batch) => {
          if (!current()) return;
          batch.forEach((product) => catalog.set(product.id, product));
          renderPhotos();
        },
      });
    }
  }
  return {
    loadCatalog,
    itemPhoto: (item) =>
      `<span class="quote-photo-slot" data-quote-photo="${escapeHtml(item.productId)}">${quoteProductPhoto(catalog.get(item.productId) || item, item.name)}</span>`,
    refreshPhotos() {
      renderPhotos();
      if (!photoRequest)
        photoRequest = loadPhotos().finally(() => {
          photoRequest = null;
        });
      return photoRequest;
    },
  };
}
