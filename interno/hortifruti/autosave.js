export function createAutosaveQueue(save, delay = 200) {
  let generation = 0;
  const jobs = new Map(),
    inFlight = new Map();
  const flush = (id) => {
    const job = jobs.get(id);
    if (job) {
      clearTimeout(job.timer);
      job.ready = true;
    }
    if (inFlight.has(id)) return inFlight.get(id);
    if (!job) return null;
    jobs.delete(id);
    try {
      const result = save(job.payload);
      if (result && typeof result.then === 'function') {
        const pending = result
          .then(
            (value) => {
              if (job.generation === generation && !jobs.has(id)) job.notify?.(null, value);
              return value;
            },
            (error) => {
              if (job.generation === generation && !jobs.has(id)) job.notify?.(error);
              return null;
            },
          )
          .then((value) => {
            if (inFlight.get(id) === pending) inFlight.delete(id);
            if (job.generation === generation && jobs.get(id)?.ready) return flush(id);
            return value;
          });
        inFlight.set(id, pending);
        return pending;
      }
      if (job.generation === generation && !jobs.has(id)) job.notify?.(null, result);
      return result;
    } catch (error) {
      if (job.generation === generation) job.notify?.(error);
      return null;
    }
  };
  return {
    schedule(id, payload, notify) {
      const old = jobs.get(id);
      if (old) clearTimeout(old.timer);
      const job = { payload, notify, generation, timer: null };
      job.timer = setTimeout(() => flush(id), delay);
      jobs.set(id, job);
    },
    flush,
    cancel(id) {
      const job = jobs.get(id);
      if (job) clearTimeout(job.timer);
      jobs.delete(id);
    },
    flushAll() {
      return [...new Set([...jobs.keys(), ...inFlight.keys()])].map(flush);
    },
    reset() {
      generation++;
      for (const job of jobs.values()) clearTimeout(job.timer);
      jobs.clear();
      inFlight.clear();
    },
    pending: (id) => jobs.has(id) || inFlight.has(id),
  };
}
