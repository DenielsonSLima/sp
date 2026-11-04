import { REQUEST_TIMEOUT_MS, FLYER_WRITE_TIMEOUT_MS } from './request-fetch.js';

// Start before the Supabase thenable acquires its auth lock, and cover the body too.
// Aborting fetch alone cannot bound a request still waiting for a session token.
export async function runRpcRequest(request, { name, signal } = {}) {
  const flyerWrite = ['sp_flyer_save', 'sp_flyer_save_delta'].includes(name);
  const controller = new AbortController();
  let timer, onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => {
      const reason = signal.reason ?? new DOMException('Operação cancelada.', 'AbortError');
      controller.abort(reason);
      reject(reason);
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new Error(flyerWrite
        ? 'O envio da arte excedeu o tempo de espera. Suas alterações continuam abertas.'
        : 'A conexão excedeu o tempo de espera. Tente novamente.');
      error.name = 'TimeoutError';
      controller.abort(error);
      reject(error);
    }, flyerWrite ? FLYER_WRITE_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  });
  try {
    if (signal?.aborted) return await interrupted;
    const work = request.abortSignal ? request.abortSignal(controller.signal) : request;
    return await Promise.race([work, interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
