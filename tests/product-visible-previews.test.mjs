import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductPreviewLoader } from '../interno/cadastros/produtos/hooks/use-product-previews.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture(load, options = {}) {
  const nodes = Array.from({ length: 20 }, (_, index) => ({ dataset: { productPhoto: `p${index}` } }));
  let observer;
  class Observer {
    constructor(callback, settings) {
      this.callback = callback;
      this.nodes = [];
      this.settings = settings;
      observer = this;
    }
    observe(node) { this.nodes.push(node); }
    disconnect() { this.disconnected = true; }
    intersect(indices, isIntersecting = true) {
      this.callback(indices.map((index) => ({ target: nodes[index], isIntersecting })));
    }
  }
  const loader = createProductPreviewLoader({
    root: { querySelectorAll: () => nodes }, load, Observer, ...options,
  });
  const rows = nodes.map((node) => ({ id: node.dataset.productPhoto, _version: 1, hasPhotos: true }));
  return { loader, rows, observer: () => observer };
}

test('photos outside the viewport do not request previews; scrolling schedules only new visible rows', async () => {
  const calls = [];
  const f = fixture(async (rows) => calls.push(rows.map((row) => row.id)));
  await f.loader.observe(f.rows);
  assert.deepEqual(calls, []);
  assert.equal(f.observer().settings.rootMargin, '250px 0px');
  f.observer().intersect([0, 1, 2, 3, 4]);
  await flush();
  assert.deepEqual(calls, [['p0', 'p1', 'p2', 'p3'], ['p4']]);
  f.observer().intersect([0, 1, 2, 3, 4, 5]);
  await flush();
  assert.deepEqual(calls.at(-1), ['p5']);
  assert.equal(calls.length, 3);
  f.loader.dispose();
});

test('preview concurrency is two batches of four; a failed batch does not starve later photos', async () => {
  const calls = [], errors = [], releases = [];
  let active = 0, peak = 0;
  const f = fixture(async (rows) => {
    calls.push(rows.map((row) => row.id));
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => releases.push(resolve));
    active--;
    if (rows[0].id === 'p0') throw Error('Falha transitória');
  }, { onError: (error, rows) => errors.push([error.message, rows.length]) });
  await f.loader.observe(f.rows);
  f.observer().intersect(Array.from({ length: 20 }, (_, index) => index));
  await flush();
  assert.equal(calls.length, 2);
  releases.splice(0).forEach((release) => release());
  await flush();
  assert.equal(calls.length, 4);
  releases.splice(0).forEach((release) => release());
  await flush();
  releases.splice(0).forEach((release) => release());
  await flush();
  assert.equal(peak, 2);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((batch) => batch.length <= 4));
  assert.deepEqual(errors, [['Falha transitória', 4]]);
  f.loader.dispose();
});

test('refresh deduplicates pending work and retries only currently visible rows', async () => {
  const calls = [], releases = [];
  const f = fixture(async (rows) => {
    calls.push(rows.map((row) => row.id));
    await new Promise((resolve) => releases.push(resolve));
  });
  await f.loader.observe(f.rows);
  f.observer().intersect([0, 1]);
  await flush();
  const pendingRefresh = f.loader.refresh();
  assert.equal(calls.length, 1);
  releases.shift()();
  await pendingRefresh;
  f.observer().intersect([0], false);
  const refresh = f.loader.refresh();
  await flush();
  assert.deepEqual(calls, [['p0', 'p1'], ['p1']]);
  releases.shift()();
  await refresh;
  f.loader.dispose();
});

test('page disposal disconnects observer, stops queued requests and ignores late responses', async () => {
  let release;
  const calls = [], emitted = [];
  const f = fixture(async (rows, { onBatch }) => {
    calls.push(rows);
    await new Promise((resolve) => { release = resolve; });
    onBatch(rows);
  }, { onBatch: (rows) => emitted.push(rows) });
  await f.loader.observe(f.rows);
  f.observer().intersect([0]);
  await flush();
  const waiting = f.loader.refresh();
  f.loader.dispose();
  await waiting;
  release();
  f.observer().intersect([1]);
  await flush();
  assert.equal(f.observer().disconnected, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(emitted, []);
});

test('without IntersectionObserver the loader stays bounded to the current page', async () => {
  const calls = [];
  const f = fixture(async (rows) => calls.push(rows), { Observer: null });
  await f.loader.observe(f.rows);
  assert.equal(calls.flat().length, 20);
  assert.ok(calls.every((rows) => rows.length <= 4));
  f.loader.dispose();
});

test('detaching the page releases its intersection and lifecycle observers', async () => {
  let lifecycle;
  class LifecycleObserver {
    constructor(callback) { this.callback = callback; lifecycle = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const root = { isConnected: true, ownerDocument: { body: {} }, querySelectorAll: () => [] };
  const f = fixture(async () => {}, { root, LifecycleObserver });
  await f.loader.observe(f.rows);
  root.isConnected = false;
  lifecycle.callback();
  assert.equal(lifecycle.disconnected, true);
  assert.equal(f.observer().disconnected, true);
  await f.loader.refresh();
});

test('refresh rechecks an expired offscreen photo only when it reenters the viewport', async () => {
  const calls = [];
  const f = fixture(async (rows) => calls.push(rows.map((row) => row.id)));
  await f.loader.observe(f.rows);
  f.observer().intersect([0]);
  await flush();
  f.observer().intersect([0], false);
  await f.loader.refresh();
  assert.deepEqual(calls, [['p0']]);
  f.observer().intersect([0]);
  await flush();
  assert.deepEqual(calls, [['p0'], ['p0']]);
  f.loader.dispose();
});
