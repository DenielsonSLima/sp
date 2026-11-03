/** Load only the current page's photos near the viewport, with a bounded queue. */
export function createProductPreviewLoader({
  root,
  load,
  onBatch = () => {},
  onError = () => {},
  isCurrent = () => true,
  Observer = globalThis.IntersectionObserver,
  LifecycleObserver = globalThis.MutationObserver,
}) {
  const rowsById = new Map(),
    visible = new Set(),
    queued = new Set(),
    pending = new Set(),
    completed = new Set(),
    waiters = new Set();
  let observer,
    lifecycleObserver,
    disposed = false,
    active = 0;
  const current = () => !disposed && isCurrent();
  const settle = () => {
    if (!disposed && (active || queued.size)) return;
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  const idle = () => {
    if (disposed || (!active && !queued.size)) return Promise.resolve();
    return new Promise((resolve) => waiters.add(resolve));
  };
  const enqueue = (id) => {
    if (rowsById.has(id) && !pending.has(id) && !completed.has(id)) queued.add(id);
  };
  const dispose = () => {
    disposed = true;
    observer?.disconnect();
    lifecycleObserver?.disconnect();
    queued.clear();
    visible.clear();
    rowsById.clear();
    settle();
  };
  const pump = () => {
    if (!current()) {
      dispose();
      return;
    }
    while (active < 2 && queued.size) {
      const ids = [...queued].slice(0, 4);
      for (const id of ids) {
        queued.delete(id);
        pending.add(id);
      }
      const rows = ids.map((id) => rowsById.get(id));
      active++;
      Promise.resolve()
        .then(() => current() && load(rows, { isCurrent: current, onBatch: (batch) => current() && onBatch(batch) }))
        .catch((error) => {
          if (current()) onError(error, rows);
        })
        .finally(() => {
          for (const id of ids) {
            pending.delete(id);
            completed.add(id);
          }
          active--;
          pump();
          settle();
        });
    }
    settle();
  };
  return {
    observe(rows) {
      if (disposed) return Promise.resolve();
      if (!Array.isArray(rows) || rows.length > 25) throw Error('Observe somente as fotos da página atual.');
      if (rowsById.size) throw Error('Crie outro carregador ao trocar a página de produtos.');
      for (const row of rows) if (row.hasPhotos) rowsById.set(row.id, row);
      if (typeof LifecycleObserver === 'function' && root.ownerDocument?.body) {
        lifecycleObserver = new LifecycleObserver(() => {
          if (!root.isConnected || !current()) dispose();
        });
        lifecycleObserver.observe(root.ownerDocument.body, { childList: true, subtree: true });
      }
      if (typeof Observer === 'function') {
        observer = new Observer((entries) => {
          if (!current()) return;
          for (const entry of entries) {
            const id = entry.target.dataset.productPhoto;
            if (entry.isIntersecting) {
              visible.add(id);
              enqueue(id);
            } else {
              visible.delete(id);
              queued.delete(id);
            }
          }
          pump();
        }, { rootMargin: '250px 0px' });
        for (const node of root.querySelectorAll('[data-product-photo]'))
          if (rowsById.has(node.dataset.productPhoto)) observer.observe(node);
      } else {
        for (const id of rowsById.keys()) {
          visible.add(id);
          enqueue(id);
        }
        pump();
      }
      return idle();
    },
    refresh() {
      if (!current()) return Promise.resolve();
      // Offscreen URLs may expire too: recheck their cache when they reenter.
      for (const id of completed) if (!pending.has(id)) completed.delete(id);
      for (const id of visible) {
        enqueue(id);
      }
      pump();
      return idle();
    },
    dispose,
  };
}
