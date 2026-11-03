export const REQUEST_TIMEOUT_MS = 20_000;
export const FLYER_WRITE_TIMEOUT_MS = 120_000;

function combineSignals(first, second) {
  if (!first) return second;
  if (AbortSignal.any) return AbortSignal.any([first, second]);
  const controller = new AbortController();
  const abort = (signal) => {
    controller.abort(signal.reason);
    first.removeEventListener('abort', onFirst);
    second.removeEventListener('abort', onSecond);
  };
  const onFirst = () => abort(first), onSecond = () => abort(second);
  if (first.aborted) abort(first);
  else if (second.aborted) abort(second);
  else {
    first.addEventListener('abort', onFirst, { once: true });
    second.addEventListener('abort', onSecond, { once: true });
  }
  return controller.signal;
}

export function createRequestFetch({ fetchImpl = globalThis.fetch, timeoutSignal = (ms) => AbortSignal.timeout(ms) } = {}) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = (init.method ?? input?.method ?? 'GET').toUpperCase();
    const flyerWrite = method === 'POST' && /^\/rest\/v1\/rpc\/sp_flyer_save(?:_delta)?$/.test(url.pathname);
    const timeout = timeoutSignal(flyerWrite ? FLYER_WRITE_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
    const callerSignal = init.signal ?? input?.signal;
    try {
      return await fetchImpl(input, { ...init, signal: combineSignals(callerSignal, timeout) });
    } catch (error) {
      if (timeout.aborted && !callerSignal?.aborted) {
        const failure = new Error(flyerWrite
          ? 'O envio da arte excedeu o tempo de espera. Suas alterações continuam abertas.'
          : 'A conexão excedeu o tempo de espera. Tente novamente.');
        failure.name = 'TimeoutError';
        throw failure;
      }
      throw error;
    }
  };
}
