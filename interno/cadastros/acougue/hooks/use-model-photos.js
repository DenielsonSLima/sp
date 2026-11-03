import { getDataContext } from '../../../../shared/data/api.js';
import { photoMarkup } from '../../produtos/view.js';
import { loadModelPreviews } from '../queries.js';

export function useModelPhotos(host, { products, onError }) {
  const scope = getDataContext();
  let generation = 0, active = true, inFlight = 0;
  const queue = [], seen = new Set();
  const current = () => active && host.isConnected
    && scope?.companyId === getDataContext()?.companyId && scope?.user?.id === getDataContext()?.user?.id;
  const drain = () => {
    while (current() && inFlight < 2 && queue.length) {
      const jobs = queue.splice(0, 4), version = generation;
      inFlight++;
      void loadModelPreviews(jobs, {
        isCurrent: () => current() && version === generation,
        onBatch: (rows) => {
          if (!current() || version !== generation) return;
          const byId = new Map(rows.map((row) => [row.id, row]));
          for (const slot of host.querySelectorAll('[data-model-photo]')) {
            const row = byId.get(slot.dataset.modelPhoto);
            if (row) slot.innerHTML = photoMarkup(row.photo, row.name);
          }
        },
      }).catch((error) => { if (current() && version === generation) onError(error); })
        .finally(() => { inFlight--; drain(); });
    }
  };
  const observer = new IntersectionObserver((entries) => {
    const catalog = new Map(products().map((p) => [p.id, p]));
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      const id = entry.target.dataset.modelPhoto, product = catalog.get(id);
      if (!product?.hasPhotos || seen.has(id)) continue;
      seen.add(id); queue.push(product);
    }
    drain();
  }, { rootMargin: '150px' });
  const detached = new MutationObserver(() => { if (!host.isConnected) dispose(); });
  detached.observe(document.body, { childList: true, subtree: true });
  function dispose() {
    if (!active) return;
    active = false; generation++; queue.length = 0;
    observer.disconnect(); detached.disconnect();
  }
  return {
    observe() {
      if (!current()) return;
      generation++; queue.length = 0; seen.clear(); observer.disconnect();
      host.querySelectorAll('[data-model-photo]').forEach((node) => observer.observe(node));
    },
    dispose,
  };
}
