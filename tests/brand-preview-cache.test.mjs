import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataApi } from '../shared/data/api.js';

function fixture(handler) {
  const calls = [];
  const client = {
    rpc: async (name, args) => { calls.push({ name, args }); return { data: await handler(name, args), error: null }; },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => {},
  };
  return { api: createDataApi({ client }), calls };
}
const context = (companyId) => ({ companyId, user: { id: 'user' } });

test('brand previews deduplicate and reuse unchanged versions after metadata invalidation', async () => {
  const { api, calls } = fixture((name, args) => {
    assert.equal(name, 'sp_brand_asset_preview');
    return { id: args.p_id, _version: args.p_expected_version, dataURL: 'preview-' + args.p_expected_version };
  });
  await api.setContext(context('a'));
  const [first, second] = await Promise.all([api.getBrandAssetPreview('png', 1), api.getBrandAssetPreview('png', 1)]);
  assert.equal(calls.length, 1);
  first.dataURL = 'mutated';
  assert.equal(second.dataURL, 'preview-1');
  const key = ['sp', 'a', 'brand_assets', 'preview', 'png', 1];
  api.queryClient.setQueryData(key, second, { updatedAt: Date.now() - 120000 });
  await api.invalidate('brand_assets');
  assert.equal((await api.getBrandAssetPreview('png', 1)).dataURL, 'preview-1');
  assert.equal(calls.length, 1, 'preview does not redownload after 30 seconds');
  assert.equal((await api.getBrandAssetPreview('png', 2)).dataURL, 'preview-2');
  assert.equal(calls.length, 2);
  await api.setContext(context('b'));
  await api.getBrandAssetPreview('png', 2);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].args.p_company_id, 'b');
  assert.equal(api.queryClient.getQueryData(key), undefined);
  await api.setContext(null);
});

test('pending preview cannot enter the next session and malformed versions are rejected', async () => {
  let resolve;
  const { api } = fixture(() => new Promise(done => { resolve = done; }));
  await api.setContext(context('a'));
  const pending = api.getBrandAssetPreview('png', 1);
  const rejected = assert.rejects(pending);
  await api.setContext(context('b'));
  resolve({ id: 'png', _version: 1, dataURL: 'old' });
  await rejected;
  await assert.rejects(api.getBrandAssetPreview('png', undefined), /Atualize/);
  assert.equal(api.queryClient.getQueryData(['sp', 'b', 'brand_assets', 'preview', 'png', 1]), undefined);
  await api.setContext(null);
});
