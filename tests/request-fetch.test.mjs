import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestFetch } from '../shared/data/request-fetch.js';
import { saveErrorMessage } from '../interno/encartes/editor/save-error.js';
const base = 'https://enhoierfwuwtzulznjxa.supabase.co/rest/v1/rpc/';
test('only flyer writes receive the upload deadline; ordinary reads retain the shorter deadline', async () => {
  const limits = [];
  const request = createRequestFetch({ fetchImpl: async () => 'ok',
    timeoutSignal: ms => { limits.push(ms); return new AbortController().signal; } });
  for (const name of ['sp_flyer_save', 'sp_flyer_save_delta', 'sp_get', 'sp_save'])
    await request(base + name, { method: 'POST' });
  await request(base + 'sp_flyer_save');
  assert.deepEqual(limits, [120000, 120000, 20000, 20000, 20000]);
});
test('upload survives the normal read deadline but reports its own deadline clearly', async () => {
  const deadline = new AbortController();
  const request = createRequestFetch({ timeoutSignal: () => deadline.signal,
    fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Fetch is aborted', 'AbortError')));
    }) });
  const pending = request(base + 'sp_flyer_save', { method: 'POST' });
  deadline.abort();
  await assert.rejects(pending, { name: 'TimeoutError', message: /envio da arte excedeu/ });
});
test('caller cancellation is preserved separately from a timeout', async () => {
  const caller = new AbortController(); caller.abort();
  const request = createRequestFetch({ timeoutSignal: () => new AbortController().signal,
    fetchImpl: async (_, { signal }) => { assert.equal(signal.aborted, true); throw signal.reason; } });
  await assert.rejects(request(base + 'sp_get', { signal: caller.signal }), { name: 'AbortError' });
});
test('editor explains an interrupted save without claiming data was saved or lost', () => {
  assert.match(saveErrorMessage(Error('AbortError: Fetch is aborted')), /não foi possível confirmar/);
  assert.match(saveErrorMessage(Error('TimeoutError: exceeded')), /não recarregue/);
  assert.equal(saveErrorMessage({ code: '40001', message: 'Conflito' }), 'Conflito');
});
