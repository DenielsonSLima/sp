/** Save the latest typed draft after a short pause; explicit navigation flushes it. */
export function createDraftAutosave(
  save,
  { delay = 400, onSaved = () => {}, onError = () => {}, setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  let pending = null,
    timer = null,
    saving = null,
    revision = 0;
  const flush = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (!pending) return saving || Promise.resolve(null);
    const input = pending,
      version = revision;
    pending = null;
    const operation = (saving || Promise.resolve())
      .catch(() => {})
      .then(() => save(input))
      .then((saved) => {
        if (version === revision && !pending) onSaved(saved);
        return saved;
      })
      .finally(() => {
        if (saving === operation) saving = null;
      });
    saving = operation;
    return operation;
  };
  return {
    schedule(input) {
      pending = structuredClone(input);
      revision++;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        void flush().catch(onError);
      }, delay);
    },
    flush,
    cancel() {
      revision++;
      pending = null;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
