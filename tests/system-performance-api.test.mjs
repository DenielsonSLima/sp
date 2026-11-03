import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataApi } from '../shared/data/api.js';
import { createMutationEcho } from '../shared/data/mutation-echo.js';
import { createOperationalStore } from '../interno/operational-store.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(handler) {
  const calls = [], events = [];
  const client = {
    channel() { return { on(_event, filter, callback) { events.push({ filter, callback }); return this; }, subscribe() { return this; } }; },
    async removeChannel() {},
    rpc(name, args) {
      const call = { name, args, headers: {}, signal: null };
      calls.push(call);
      return {
        setHeader(name, value) { call.headers[name] = value; return this; },
        abortSignal(signal) { call.signal = signal; return this; },
        then(resolve, reject) { return Promise.resolve().then(() => handler(call)).then(resolve, reject); },
      };
    },
  };
  const api = createDataApi({ client });
  const emit = (resource, mutation_id) => events.find((e) => e.filter.table === 'resource_changes').callback({ new: { resource, mutation_id } });
  return { api, calls, emit };
}

test('resource pages share a small query, use cancellation and stay isolated by filter/company', async () => {
  const f = fixture(async ({ args }) => ({ data: { items: [{ id: args.p_query || 'a', _version: 1 }], total: 1, page: 1 }, error: null }));
  await f.api.setContext({ companyId: 'a' });
  const [first, second] = await Promise.all([f.api.listResourcePage('quotes'), f.api.listResourcePage('quotes')]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'sp_resource_page');
  assert(f.calls[0].signal instanceof AbortSignal);
  first.items[0].id = 'edited';
  assert.equal(second.items[0].id, 'a');
  await f.api.listResourcePage('quotes', { query: 'coffee' });
  assert.equal(f.calls.length, 2);
  await assert.rejects(f.api.listResourcePage('unknown'), /recurso/);
  await assert.rejects(f.api.listResourcePage('quotes', { perPage: 1000 }), /Página/);
  await f.api.setContext({ companyId: 'b' });
  await f.api.listResourcePage('quotes');
  assert.equal(f.calls.at(-1).args.p_company_id, 'b');
  await f.api.setContext(null);
});

test('calendar reads summaries by period and metadata rename sends no binary', async () => {
  const f = fixture(async ({ name, args }) => ({ data: name === 'sp_campaign_calendar' ? [] : { id: args.p_id, name: args.p_name, _version: 3 }, error: null }));
  await f.api.setContext({ companyId: 'a' });
  await f.api.listCampaignCalendar({ start: '2026-11-01', end: '2026-11-30' });
  assert.equal(f.calls[0].name, 'sp_campaign_calendar');
  const saved = await f.api.updateBrandAssetMetadata('logo', { name: 'Novo nome', category: 'Logos', _version: 2, dataURL: 'huge-image' });
  assert.equal(saved._version, 3);
  assert.deepEqual(f.calls[1].args, { p_company_id: 'a', p_id: 'logo', p_name: 'Novo nome', p_category: 'Logos', p_expected_version: 2 });
  assert(f.calls[1].headers['x-sp-mutation-id']);
  await f.api.setContext(null);
});

test('successful own realtime echo does not repeat refresh; another mutation still does', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(async ({ name }) => ({ data: name === 'sp_list' ? [{ id: 'unit', _version: 2 }] : { id: 'unit', _version: 2 }, error: null }));
  await f.api.setContext({ companyId: 'a' });
  await f.api.listRecords('units');
  let refreshed;
  const stop = f.api.subscribeResource('units', () => { refreshed = f.api.listRecords('units'); return refreshed; });
  await f.api.saveRecord('units', { id: 'unit', _version: 1 });
  await refreshed;
  const mutationId = f.calls.find((call) => call.name === 'sp_save').headers['x-sp-mutation-id'];
  assert.equal(f.calls.filter((call) => call.name === 'sp_list').length, 2);
  f.emit('units', mutationId);
  t.mock.timers.tick(100);
  await tick();
  assert.equal(f.calls.filter((call) => call.name === 'sp_list').length, 2);
  f.emit('units', crypto.randomUUID());
  t.mock.timers.tick(100);
  await tick();
  await refreshed;
  assert.equal(f.calls.filter((call) => call.name === 'sp_list').length, 3);
  stop();
  await f.api.setContext(null);
});

test('early realtime echo is deferred until local success; uncertain failure reconciles and cross-resource signals survive', () => {
  const invalidated = [];
  const echo = createMutationEcho({ onUncertainChange: (resource) => invalidated.push(resource) });
  const id = echo.begin('products');
  assert.equal(echo.handles('products', id), true);
  assert.equal(echo.handles('categories', id), false);
  echo.finish(id, false);
  assert.deepEqual(invalidated, ['products']);
  assert.equal(echo.handles('products', id), false);
  const success = echo.begin('units');
  echo.finish(success, true);
  assert.equal(echo.handles('units', success), true);
  echo.clear();
  assert.equal(echo.handles('units', success), false);
});

test('snapshot URLs survive metadata invalidation but never a company switch', async () => {
  const f = fixture(async () => ({ data: [], error: null }));
  await f.api.setContext({ companyId: 'a' });
  const key = ['sp', 'a', 'snapshot_media', 'quotes', 'p', 'immutable-path'];
  const value = { photoEntries: [{ src: 'signed-url' }], expiresAt: Date.now() + 10000 };
  f.api.queryClient.setQueryData(key, value);
  await f.api.invalidate('quotes');
  assert.deepEqual(f.api.queryClient.getQueryData(key), value);
  await f.api.setContext({ companyId: 'b' });
  assert.equal(f.api.queryClient.getQueryData(key), undefined);
  await f.api.setContext(null);
});

test('viewed page versions protect batch transitions without fetching complete documents', async () => {
  const calls = [];
  const store = createOperationalStore('price_tables', {
    getDataContext: () => ({ companyId: 'a', user: { id: 'u' } }),
    listResourcePage: async () => ({ items: [{ id: 'table', _version: 7 }], total: 1, page: 1 }),
    command: async (...args) => { calls.push(args); return []; },
  }, { realtime: false });
  const page = await store.loadPage();
  assert.deepEqual(store.list(), []);
  store.viewPage(page.items);
  await store.run('send', null, { keys: ['table'] });
  assert.deepEqual(calls[0][3].expectedVersions, { table: 7 });
  assert.deepEqual(store.list(), []);
});
