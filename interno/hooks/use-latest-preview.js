/** Debounced RPC previews: one request in flight and only the newest pending input. */
export function useLatestPreview({ run, onResult, onError = () => {}, isCurrent = () => true, delay = 180 }) {
  let version = 0, pending = null, inFlight = null, timer = null, disposed = false;
  const active = () => !disposed && isCurrent();
  const drain = () => {
    if (!active()) { pending = null; return Promise.resolve(); }
    if (inFlight) return inFlight;
    if (!pending?.ready) return Promise.resolve();
    const job = pending;
    pending = null;
    const task = Promise.resolve()
      .then(() => active() ? run(job.input) : undefined)
      .then(
        (result) => {
          if (active() && job.version === version) onResult(result);
          return result;
        },
        (error) => {
          if (active() && job.version === version) onError(error);
        },
      )
      .finally(() => { if (inFlight === task) inFlight = null; })
      .then((result) => pending?.ready && active() ? drain() : result);
    inFlight = task;
    return task;
  };
  return {
    schedule(input) {
      if (!active()) return;
      clearTimeout(timer);
      pending = { input: structuredClone(input), version: ++version, ready: false };
      timer = setTimeout(() => {
        if (pending) pending.ready = true;
        void drain();
      }, delay);
    },
    flush() {
      clearTimeout(timer);
      if (pending) pending.ready = true;
      return drain();
    },
    dispose() {
      disposed = true;
      version++;
      pending = null;
      clearTimeout(timer);
    },
  };
}
