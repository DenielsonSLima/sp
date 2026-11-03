import { watchDomain } from '../realtime.js';
import { inspectQuoteRecord, acceptQuoteRecord } from '../services.js';

/** Remote edits are announced without overwriting local input or its viewed version. */
export function useDetailRealtime({ root, quote, isCurrent, isBusy, apply, watch = watchDomain,
  read = inspectQuoteRecord, accept = acceptQuoteRecord }) {
  let changed = false, loading = false, error = '';
  const sync = () => {
    if (!isCurrent()) return;
    const notice = root.querySelector('[data-quote-update]');
    if (!notice) return;
    notice.hidden = !changed && !error;
    notice.replaceChildren();
    if (notice.hidden) return;
    const message = document.createElement('span');
    message.textContent = error || 'Esta cotação foi alterada em outra aba ou por outra pessoa.';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary';
    button.textContent = loading ? 'Atualizando…' : 'Atualizar cotação';
    button.disabled = loading || isBusy();
    button.onclick = update;
    notice.append(message, button);
    if (isBusy()) {
      const hint = document.createElement('span');
      hint.textContent = ' Termine ou descarte as alterações pendentes antes de atualizar.';
      notice.append(hint);
    }
  };
  const update = async () => {
    if (!isCurrent() || loading || isBusy()) return;
    loading = true; error = ''; sync();
    const version = quote._version;
    try {
      const record = await read(quote.id);
      if (!isCurrent() || isBusy() || quote._version !== version) return;
      if (!record) throw Error('Esta cotação não está mais disponível. Volte à lista.');
      if (record._version < quote._version) return;
      accept(record);
      changed = false;
      apply(record);
    } catch (cause) {
      if (isCurrent()) error = cause.message;
    } finally {
      loading = false; sync();
    }
  };
  const unwatch = watch(root, async () => {
    if (!isCurrent()) { stop(); return; }
    try {
      const record = await read(quote.id);
      if (!isCurrent()) return;
      changed = !record || record._version > quote._version;
      error = '';
    } catch (cause) {
      if (isCurrent()) error = 'Não foi possível conferir as atualizações da cotação. ' + cause.message;
    }
    sync();
  });
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(() => {
    if (!isCurrent()) stop();
  }) : null;
  const stop = () => { unwatch(); observer?.disconnect(); };
  observer?.observe(root, { childList: true, subtree: true });
  return { sync, stop };
}
