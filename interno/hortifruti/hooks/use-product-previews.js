import { getDataContext } from '../../../shared/data/api.js';

/** Only photos of visible product rows are requested, in bounded batches. */
export function useProductPreviews(host, { loadPreviews, onPreview, onError = () => {} }) {
  const scope = getDataContext();
  let active = true,
    generation = 0,
    inFlight = 0;
  const queue = [],
    seen = new Set();
  const current = () =>
    active &&
    host.isConnected &&
    scope?.companyId === getDataContext()?.companyId &&
    scope?.user?.id === getDataContext()?.user?.id;
  const drain = () => {
    while (current() && inFlight < 2 && queue.length) {
      const job = queue.shift();
      if (job.generation !== generation) continue;
      inFlight++;
      void loadPreviews([job.product], {
        isCurrent: () => current() && job.generation === generation,
        onBatch: (rows) => {
          if (current() && job.generation === generation) rows.forEach(onPreview);
        },
      })
        .catch((error) => {
          if (current() && job.generation === generation) onError(error);
        })
        .finally(() => {
          inFlight--;
          drain();
        });
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const product = entry.target.productPreview;
        if (!product || seen.has(product.id)) continue;
        seen.add(product.id);
        queue.push({ product, generation });
      }
      drain();
    },
    { root: host.querySelector('.hf-picker-list'), rootMargin: '120px' },
  );
  const detached = new MutationObserver(() => {
    if (!host.isConnected) dispose();
  });
  detached.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    if (!active) return;
    active = false;
    generation++;
    queue.length = 0;
    observer.disconnect();
    detached.disconnect();
  }
  return {
    observe(rows, catalog) {
      generation++;
      queue.length = 0;
      seen.clear();
      observer.disconnect();
      const byId = new Map(catalog.map((product) => [product.id, product]));
      rows.forEach((row) => {
        row.productPreview = byId.get(row.dataset.productId);
        observer.observe(row);
      });
    },
    dispose,
  };
}
