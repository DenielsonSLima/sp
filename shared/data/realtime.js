import { resourceSet } from './resources.js';

/** Owns the one company channel; documents and binary media never enter events. */
export function createRealtimeTransport({
  supabase,
  getGeneration,
  onResourceChanged,
  onAccessChanged,
  resourceNames,
  handlesMutation = () => false,
}) {
  let channel = null;
  const timers = new Map(),
    connectionListeners = new Set();
  const connection = { status: 'disconnected' };
  function scheduleInvalidation(resource) {
    clearTimeout(timers.get(resource));
    timers.set(
      resource,
      setTimeout(() => {
        timers.delete(resource);
        void onResourceChanged(resource);
      }, 80),
    );
  }
  function setConnection(status) {
    connection.status = status;
    for (const fn of connectionListeners) fn({ ...connection });
  }
  async function stopRealtime() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    const previous = channel;
    channel = null;
    try {
      if (previous) await supabase().removeChannel(previous);
    } finally {
      setConnection('disconnected');
    }
  }

  function start(context) {
    const currentGeneration = getGeneration();
    channel = supabase().channel(`store:${context.companyId}:${context.user?.id ?? 'member'}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'resource_changes', filter: `company_id=eq.${context.companyId}` },
      (payload) => {
        if (getGeneration() !== currentGeneration) return;
        const resource = payload.new?.resource;
        if (resourceSet.has(resource) && !handlesMutation(resource, payload.new?.mutation_id)) scheduleInvalidation(resource);
      },
    );
    if (context.user?.id)
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memberships', filter: `user_id=eq.${context.user.id}` },
        () => {
          if (getGeneration() !== currentGeneration) return;
          scheduleInvalidation('user_access');
          void onAccessChanged();
        },
      );
    setConnection('connecting');
    channel.subscribe((status) => {
      if (getGeneration() !== currentGeneration) return;
      setConnection(
        status === 'SUBSCRIBED'
          ? 'connected'
          : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
            ? 'reconnecting'
            : 'connecting',
      );
      if (status === 'SUBSCRIBED') for (const resource of resourceNames()) scheduleInvalidation(resource);
    });
  }
  const subscribeConnection = (callback) => {
    connectionListeners.add(callback);
    callback({ ...connection });
    return () => connectionListeners.delete(callback);
  };
  return { start, stop: stopRealtime, subscribeConnection };
}
