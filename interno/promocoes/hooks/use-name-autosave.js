/** Coalesce each field while preserving the newest unsaved text after failures. */
export function createNameAutosave(save, {
  delay = 450,
  isCurrent = () => true,
  onSaved = () => {},
  onError = () => {},
} = {}) {
  const fields = new Map();
  let disposed = false;
  const current = () => !disposed && isCurrent();
  const field = (id, initial) => {
    if (!fields.has(id)) fields.set(id, { saved: initial, value: initial, timer: null, pending: null });
    return fields.get(id);
  };
  const flushField = async (id) => {
    const state = fields.get(id);
    if (!state) return;
    clearTimeout(state.timer);
    if (state.pending) return state.pending;
    if (state.value === state.saved) {
      if (current()) onSaved(id, state.value);
      return;
    }
    state.pending = (async () => {
      while (state.value !== state.saved) {
        if (!current()) throw Error('A sessão ou empresa mudou. Reabra a campanha.');
        const value = state.value;
        const result = await save(id, value);
        if (!current()) throw Error('A sessão ou empresa mudou durante a gravação.');
        state.saved = value;
        // An earlier response must never clear a newer draft.
        if (state.value === value) onSaved(id, value, result);
      }
    })().catch((error) => {
      if (current()) onError(error, id);
      throw error;
    }).finally(() => { state.pending = null; });
    return state.pending;
  };
  return {
    register(id, value = '') { field(id, value); },
    schedule(id, value) {
      const state = field(id, '');
      state.value = value;
      clearTimeout(state.timer);
      if (current() && state.value !== state.saved)
        state.timer = setTimeout(() => { void flushField(id).catch(() => {}); }, delay);
    },
    flush: (id) => id ? flushField(id) : Promise.all([...fields.keys()].map(flushField)),
    forget(id) { clearTimeout(fields.get(id)?.timer); fields.delete(id); },
    dispose() {
      disposed = true;
      for (const state of fields.values()) clearTimeout(state.timer);
    },
  };
}
