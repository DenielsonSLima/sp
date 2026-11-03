import { subscribeResource, getDataContext } from './api.js';

const scope = () => {
  const context = getDataContext();
  return context ? JSON.stringify([context.companyId, context.user?.id]) : null;
};

/** One lifecycle and refresh queue for every resource used by a mounted view. */
export function watchResources(root, resources, refresh) {
  const initialScope = scope();
  if (initialScope === null) return () => {};
  let disposed = false,
    running = false,
    pending = false,
    timer = null;
  const current = () => !disposed && root.isConnected && scope() === initialScope && initialScope !== null;
  const report = (error) => {
    if (!current()) return;
    const status = root.querySelector('[role=status]');
    if (status) status.textContent = error.message;
  };
  const run = async () => {
    timer = null;
    if (!current()) {
      stop();
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await refresh();
    } catch (error) {
      report(error);
    } finally {
      running = false;
      if (pending && current()) {
        pending = false;
        enqueue();
      }
    }
  };
  const enqueue = () => {
    if (!current()) {
      stop();
      return;
    }
    if (timer !== null) return;
    timer = setTimeout(run, 20);
  };
  const unsubscribe = [...new Set(resources)].map((resource) => subscribeResource(resource, enqueue));
  const observer = new MutationObserver(() => {
    if (!root.isConnected) stop();
  });
  const stop = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    timer = null;
    unsubscribe.forEach((fn) => fn());
    observer.disconnect();
  };
  observer.observe(document.body, { childList: true, subtree: true });
  return stop;
}

export const watchResource = (root, resource, refresh) => watchResources(root, [resource], refresh);
