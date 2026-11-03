import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataApi, PRODUCT_MEDIA_CACHE_MS } from '../shared/data/api.js';

const company = 'a';
const metadata = (version = 1) => [{ id: 'p', _version: version, hasPhotos: true }];
function fixture() {
  let time = 1000, version = 1;
  const calls = [], signs = [];
  const client = {
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: async () => {},
    rpc: async (name, args) => {
      calls.push({ name, args });
      await new Promise((resolve) => setImmediate(resolve));
      return { data: args.p_ids.map((id) => ({ id, _version: version, photos: [], photoAssets: [{
        bucket: 'product-photos', path: `${company}/products/${id}/v${version}.png`,
        mimeType: 'image/png', size: 100, position: 0,
      }] })), error: null };
    },
    storage: { from: () => ({ createSignedUrls: async (paths) => {
      signs.push(paths);
      return { data: paths.map((path) => ({ path,
        signedUrl: `https://enhoierfwuwtzulznjxa.supabase.co/storage/v1/object/sign/product-photos/${path}?token=${signs.length}`,
      })), error: null };
    } }) },
  };
  return { api: createDataApi({ client, now: () => time }), calls, signs,
    expire: () => { time += PRODUCT_MEDIA_CACHE_MS + 1; },
    advance: (milliseconds) => { time += milliseconds; },
    update: () => { version++; },
  };
}

test('concurrent previews share RPC/signing and unchanged versions survive resource signals', async () => {
  const f = fixture();
  await f.api.setContext({ companyId: company });
  try {
    const results = [];
    await Promise.all([1, 2].map(() => f.api.loadProductPreviews(metadata(), {
      onBatch: (rows) => results.push(rows[0].photo),
    })));
    assert.equal(f.calls.length, 1);
    assert.equal(f.signs.length, 1);
    assert.equal(results.length, 2);
    await f.api.invalidate('products');
    await f.api.loadProductPreviews(metadata());
    assert.equal(f.calls.length, 1);
    f.update();
    await f.api.loadProductPreviews(metadata(2));
    assert.equal(f.calls.length, 2, 'changed version fetches a new primary photo');
    f.expire();
    await f.api.loadProductPreviews(metadata(2));
    assert.equal(f.signs.length, 3, 'expired URL is signed again');
  } finally { await f.api.setContext(null); }
});

test('a cancelled view cannot suppress a shared preview requested by the current view', async () => {
  const f = fixture();
  await f.api.setContext({ companyId: company });
  try {
    let active = true, stale = 0, fresh = 0;
    const first = f.api.loadProductPreviews(metadata(), {
      isCurrent: () => active, onBatch: () => stale++,
    });
    active = false;
    const second = f.api.loadProductPreviews(metadata(), { onBatch: () => fresh++ });
    await Promise.all([first, second]);
    assert.equal(stale, 0);
    assert.equal(fresh, 1);
    assert.equal(f.calls.length, 1);
  } finally { await f.api.setContext(null); }
});

test('photos loaded later retain their own URL renewal deadline after the first timer fires', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  await f.api.setContext({ companyId: company });
  try {
    let refreshes = 0;
    f.api.subscribeResource('products', () => { refreshes++; });
    await f.api.loadProductPreviews(metadata());
    f.advance(100_000);
    t.mock.timers.tick(100_000);
    await f.api.loadProductPreviews([{ id: 'q', _version: 1, hasPhotos: true }]);
    f.advance(PRODUCT_MEDIA_CACHE_MS - 100_000);
    t.mock.timers.tick(PRODUCT_MEDIA_CACHE_MS - 100_000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(refreshes, 1);
    f.advance(100_000);
    t.mock.timers.tick(100_000);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(refreshes, 2, 'the later visible photo renews even without another product event');
  } finally { await f.api.setContext(null); }
});
