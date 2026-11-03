import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataApi } from '../shared/data/api.js';
import { isTransientAccessError } from '../shared/data/access-errors.js';
import { createRealtimeTransport } from '../shared/data/realtime.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const context = (companyId = 'store', userId = 'user') => {
  const company = { id: companyId, name: 'Loja', modules: ['inicio', 'cotacao'] };
  return { companyId, user: { id: userId }, company, companies: [company] };
};
function accessEvents(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const window = new EventTarget(), events = [];
  window.addEventListener('sp:access-changed', event => events.push(event.type));
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
  return events;
}
function fixture(t, handler) {
  const calls = [], channels = [];
  const client = {
    rpc(name, args) { calls.push({ name, args }); return handler(name, args); },
    channel() {
      const channel = { on() { return this; }, subscribe(callback) { this.callback = callback; return this; } };
      channels.push(channel);
      return channel;
    },
    async removeChannel() {},
  };
  const api = createDataApi({ client });
  t.mock.method(console, 'error', () => {});
  t.after(() => api.setContext(null));
  return { api, calls, channels };
}

test('access transport classification never treats auth or unknown failures as connectivity', () => {
  for (const error of [
    { status: 0, code: '', message: 'TypeError: Failed to fetch' },
    { status: 0, code: '', message: 'TimeoutError: A conexão excedeu o tempo de espera.' },
    { status: 502, message: 'Bad gateway' },
    { status: 503, code: 'PGRST001', message: 'Database unavailable' },
    new TypeError('fetch failed'),
  ]) assert.equal(isTransientAccessError(error), true, JSON.stringify(error));
  for (const error of [
    { status: 401, message: 'Failed to fetch' },
    { status: 403, message: 'Bad gateway' },
    { status: 500, code: '42501' },
    { status: 500, code: 'PGRST301' },
    { status: 500, code: '28000' },
    { status: 0, message: 'Unexpected error' },
    { code: 'P0001', message: 'Load failed' },
    new Error('Empresa removida'),
    new TypeError('Cannot read properties of undefined'),
  ]) assert.equal(isTransientAccessError(error), false, JSON.stringify(error));
});

test('network and server failures during access refresh preserve the screen context and cache', async t => {
  const events = accessEvents(t);
  let response;
  const { api, channels } = fixture(t, () => Promise.resolve(response));
  const current = context();
  await api.setContext(current);
  const key = ['sp', 'store', 'quotes', 'detail', 'q'];
  api.queryClient.setQueryData(key, { id: 'q', _version: 4 });
  let cleared = 0;
  api.subscribeResource('quotes', () => { if (!api.getDataContext()) cleared++; });
  for (response of [
    { status: 0, error: { code: '', message: 'TypeError: Failed to fetch' } },
    { status: 0, error: { code: '', message: 'TimeoutError: A conexão excedeu o tempo de espera.' } },
    { status: 503, error: { code: 'PGRST001', message: 'Database unavailable' } },
  ]) {
    await api.refreshAccess();
    assert.deepEqual(api.getDataContext(), current);
    assert.equal(api.queryClient.getQueryData(key)._version, 4);
    assert.equal(channels.length, 1);
    assert.equal(cleared, 0, 'a transient failure must not clear module drafts');
  }
  response = { data: current, status: 200, error: null };
  await api.refreshAccess();
  assert.equal(channels.length, 1, 'successful retry of unchanged permissions retains the channel');
  assert.equal(api.queryClient.getQueryData(key)._version, 4);
  assert.deepEqual(events, [], 'unchanged access must not rebuild the current module');
});

test('denied access, invalid authentication and removed membership still clear cached data', async t => {
  const events = accessEvents(t);
  let response;
  const { api } = fixture(t, () => Promise.resolve(response));
  for (response of [
    { status: 401, error: { code: 'PGRST301', message: 'Invalid JWT' } },
    { status: 403, error: { code: '42501', message: 'Acesso não autorizado.' } },
    { status: 200, error: null, data: { user: { id: 'user' }, companies: [] } },
  ]) {
    events.length = 0;
    await api.setContext(context());
    api.queryClient.setQueryData(['sp', 'store', 'units'], [{ id: 'unit' }]);
    await api.refreshAccess();
    assert.equal(api.getDataContext(), null);
    assert.equal(api.queryClient.getQueryCache().getAll().length, 0);
    assert.deepEqual(events, ['sp:access-changed'], 'the app must unmount the unauthorized screen');
  }
});

test('late access rejection from a former company cannot erase a new session', async t => {
  const events = accessEvents(t);
  const oldRequest = deferred(), newRequest = deferred();
  let reads = 0;
  const { api } = fixture(t, () => (++reads === 1 ? oldRequest.promise : newRequest.promise));
  await api.setContext(context('old'));
  const previousRefresh = api.refreshAccess();
  await api.setContext(context('new', 'other-user'));
  const nextRefresh = api.refreshAccess();
  assert.notEqual(previousRefresh, nextRefresh, 'new context needs its own access check');
  assert.equal(api.refreshAccess(), nextRefresh, 'same-context checks remain deduplicated');
  oldRequest.resolve({ status: 403, error: { code: '42501', message: 'Acesso removido.' } });
  await previousRefresh;
  assert.equal(api.getDataContext().companyId, 'new');
  assert.equal(api.refreshAccess(), nextRefresh, 'old cleanup must not release the new in-flight check');
  newRequest.resolve({ status: 200, data: context('new', 'other-user'), error: null });
  await nextRefresh;
  assert.equal(api.getDataContext().user.id, 'other-user');
  assert.deepEqual(events, []);
});

test('a successful retry applies changed permissions and discards the former cache', async t => {
  const events = accessEvents(t);
  const updated = context();
  updated.company.modules = ['inicio'];
  const { api, channels } = fixture(t, () => Promise.resolve({ data: updated, error: null, status: 200 }));
  await api.setContext(context());
  api.queryClient.setQueryData(['sp', 'store', 'quotes'], [{ id: 'q' }]);
  await api.refreshAccess();
  assert.deepEqual(api.getDataContext().company.modules, ['inicio']);
  assert.equal(api.queryClient.getQueryCache().getAll().length, 0);
  assert.equal(channels.length, 2);
  assert.deepEqual(events, ['sp:access-changed']);
});

test('Realtime reconnect revalidates access, but a channel from a former session cannot', async () => {
  let callback, accessChecks = 0, generation = 1;
  const transport = createRealtimeTransport({
    supabase: () => ({
      channel: () => ({ on() { return this; }, subscribe(fn) { callback = fn; } }),
      async removeChannel() {},
    }),
    getGeneration: () => generation,
    onResourceChanged() {},
    onAccessChanged() { accessChecks++; },
    resourceNames: () => [],
  });
  transport.start(context());
  callback('SUBSCRIBED');
  assert.equal(accessChecks, 0, 'the initial context was already checked');
  callback('CHANNEL_ERROR');
  callback('SUBSCRIBED');
  assert.equal(accessChecks, 1);
  generation++;
  callback('SUBSCRIBED');
  assert.equal(accessChecks, 1);
  await transport.stop();
});

test('late channel shutdown cannot replace the new connected state or report old callbacks', async () => {
  const closing = deferred(), channels = [], statuses = [];
  let generation = 1, accessChecks = 0;
  const transport = createRealtimeTransport({
    supabase: () => ({
      channel: () => {
        const channel = { on() { return this; }, subscribe(callback) { this.callback = callback; } };
        channels.push(channel);
        return channel;
      },
      removeChannel: () => closing.promise,
    }),
    getGeneration: () => generation,
    onResourceChanged() {},
    onAccessChanged() { accessChecks++; },
    resourceNames: () => [],
  });
  const stopWatching = transport.subscribeConnection(({ status }) => statuses.push(status));
  transport.start(context('old'));
  channels[0].callback('SUBSCRIBED');
  const stopping = transport.stop();
  generation++;
  transport.start(context('new'));
  channels[1].callback('SUBSCRIBED');
  closing.resolve();
  await stopping;
  channels[0].callback('CLOSED');
  channels[0].callback('SUBSCRIBED');
  assert.equal(statuses.at(-1), 'connected');
  assert.equal(accessChecks, 0);
  assert.deepEqual(statuses, ['disconnected', 'connecting', 'connected', 'connecting', 'connected']);
  await transport.stop();
  assert.equal(statuses.at(-1), 'disconnected');
  channels[1].callback('SUBSCRIBED');
  assert.equal(statuses.at(-1), 'disconnected', 'an intentionally closed channel is no longer current');
  stopWatching();
});

test('a failed initial Realtime connection revalidates access when it finally subscribes', async () => {
  let callback, accessChecks = 0;
  const transport = createRealtimeTransport({
    supabase: () => ({
      channel: () => ({ on() { return this; }, subscribe(fn) { callback = fn; } }),
      async removeChannel() {},
    }),
    getGeneration: () => 1,
    onResourceChanged() {},
    onAccessChanged() { accessChecks++; },
    resourceNames: () => [],
  });
  transport.start(context());
  callback('TIMED_OUT');
  callback('SUBSCRIBED');
  assert.equal(accessChecks, 1);
  await transport.stop();
});
