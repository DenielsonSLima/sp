/** Serialize writes while replacing obsolete snapshots that have not started. */
export function createSaveQueue() {
  const queued = [],
    pending = new Map(),
    idle = [];
  let running = false;
  const drain = async () => {
    if (running) return;
    running = true;
    while (queued.length) {
      const job = queued.shift();
      pending.delete(job.key);
      try {
        const result = await job.write();
        job.waiters.forEach(({ resolve }) => resolve(result));
      } catch (error) {
        job.waiters.forEach(({ reject }) => reject(error));
      }
    }
    running = false;
    idle.splice(0).forEach((resolve) => resolve());
  };
  return {
    enqueue(key, write) {
      return new Promise((resolve, reject) => {
        let job = pending.get(key);
        if (!job) {
          job = { key, write, waiters: [] };
          pending.set(key, job);
          queued.push(job);
        }
        job.write = write;
        job.waiters.push({ resolve, reject });
        queueMicrotask(drain);
      });
    },
    whenIdle() {
      return running || queued.length ? new Promise((resolve) => idle.push(resolve)) : Promise.resolve();
    },
  };
}
