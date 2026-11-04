import test from 'node:test';
import assert from 'node:assert/strict';
import { runRpcRequest } from '../shared/data/request-deadline.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

test('RPC waiting for auth cannot leave reads pending forever, even if it ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal, finish;
  const request = {
    abortSignal(value) { signal = value; return this; },
    then(resolve) { finish = resolve; },
  };
  const pending = runRpcRequest(request, { name: 'sp_get' });
  const rejected = assert.rejects(pending, { name: 'TimeoutError', message: /tempo de espera/ });
  await flush();
  t.mock.timers.tick(20_000);
  await rejected;
  assert.equal(signal.aborted, true);
  finish({ data: 'late original PNG' });
  await flush();
});

test('flyer saves keep the longer deadline and never report a late acknowledgement as success', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let settled = false;
  const pending = runRpcRequest(new Promise(() => {}), { name: 'sp_flyer_save_delta' });
  pending.finally(() => { settled = true; }).catch(() => {});
  const rejected = assert.rejects(pending, { name: 'TimeoutError', message: /envio da arte/ });
  t.mock.timers.tick(20_000);
  await flush();
  assert.equal(settled, false);
  t.mock.timers.tick(100_000);
  await rejected;
});

test('caller cancellation releases the RPC without waiting for auth or the deadline', async () => {
  const caller = new AbortController();
  let signal;
  const request = { abortSignal(value) { signal = value; return new Promise(() => {}); } };
  const pending = runRpcRequest(request, { name: 'sp_get', signal: caller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  caller.abort();
  await rejected;
  assert.equal(signal.aborted, true);
});

test('already cancelled calls never start work and completed calls clear their timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(runRpcRequest({ abortSignal() { assert.fail('Started cancelled request'); } },
    { signal: caller.signal }), { name: 'AbortError' });
  let signal;
  const result = await runRpcRequest({ abortSignal(value) { signal = value; return { data: 'ok' }; } });
  assert.deepEqual(result, { data: 'ok' });
  t.mock.timers.tick(120_000);
  assert.equal(signal.aborted, false);
});
