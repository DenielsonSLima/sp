// Product replacements use a bounded queue and only request primary photos.
export function createCatalogPhotoLoader({ loadPreviews, isCurrent = () => true, now = () => Date.now() } = {}) {
  const cache = new Map(),
    queue = [];
  let active = 0,
    generation = 0;
  const stale = () => Error('O catálogo ou a sessão mudou durante o carregamento da foto.');
  const drain = () => {
    while (active < 2 && queue.length) {
      const job = queue.shift();
      if (!isCurrent() || job.generation !== generation) {
        job.reject(stale());
        continue;
      }
      active++;
      void (async () => {
        const current = () => isCurrent() && job.generation === generation;
        try {
          let photo = '',
            received = false;
          await loadPreviews([job.product], {
            isCurrent: current,
            onBatch: (rows) => {
              if (!current()) return;
              const row = rows.find((row) => row.id === job.product.id);
              if (row) {
                photo = row.photo || '';
                received = true;
              }
            },
          });
          if (!current()) throw stale();
          if (!received) throw Error('Não foi possível carregar a foto principal do produto.');
          job.resolve(photo);
        } catch (error) {
          job.reject(error);
        } finally {
          active--;
          drain();
        }
      })();
    }
  };
  const load = (product) => {
    if (!isCurrent()) return Promise.reject(stale());
    const key = product.id + ':' + product._version,
      cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.promise;
    const token = generation;
    const pending = new Promise((resolve, reject) => queue.push({ product, generation: token, resolve, reject }));
    const entry = { promise: pending, expiresAt: now() + 600_000 };
    cache.set(key, entry);
    void pending.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    drain();
    return pending;
  };
  load.clear = () => {
    generation++;
    cache.clear();
    for (const job of queue.splice(0)) job.reject(stale());
  };
  return load;
}
