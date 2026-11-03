/** Coalesce a resource burst; an event during a read requests one fresh follow-up. */
export function createHomeRefresh(read, apply, isCurrent = () => true) {
  let pending = null,
    reading = false,
    dirty = false;
  return () => {
    if (!isCurrent()) return Promise.resolve();
    if (pending) {
      if (reading) dirty = true;
      return pending;
    }
    pending = Promise.resolve()
      .then(async () => {
        do {
          dirty = false;
          reading = true;
          const value = await read();
          if (isCurrent()) apply(value);
        } while (dirty && isCurrent());
      })
      .finally(() => {
        pending = null;
        reading = false;
      });
    return pending;
  };
}
