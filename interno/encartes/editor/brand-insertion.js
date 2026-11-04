import { REQUEST_TIMEOUT_MS } from '../../../shared/data/request-fetch.js';

// Bound the wait even when Query Core is paused offline; discard late results.
export function createBrandInsertion({ read, onInsert, isCurrent, onState, timeoutMs = REQUEST_TIMEOUT_MS }) {
  let pending = null;
  const cancel = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.finish();
    pending = null;
  };
  return {
    cancel,
    async insert(asset) {
      if (pending || !isCurrent()) return false;
      const job = {};
      pending = job;
      const current = () => pending === job && isCurrent();
      const interrupted = new Promise((resolve, reject) => {
        job.finish = () => resolve(null);
        job.timer = setTimeout(() => {
          reject(Error('O PNG demorou para carregar. Clique no selo para tentar novamente.'));
        }, timeoutMs);
      });
      try {
        onState({ state: 'loading', asset });
        const full = await Promise.race([read(asset.id, asset._version), interrupted]);
        if (!current()) return false;
        if (!full?.dataURL || !Number.isFinite(full.width) || full.width <= 0 ||
            !Number.isFinite(full.height) || full.height <= 0)
          throw Error('O PNG retornou sem imagem ou dimensões válidas. Atualize a biblioteca.');
        if (await onInsert(full) === false) throw Error('Não foi possível adicionar o PNG à arte.');
        if (current()) onState({ state: 'success', asset });
        return true;
      } catch (error) {
        if (current()) onState({ state: 'error', asset, error });
        return false;
      } finally {
        clearTimeout(job.timer);
        if (pending === job) pending = null;
      }
    },
  };
}
