import test from "node:test";
import assert from "node:assert/strict";
import { useProductPage } from "../interno/cadastros/produtos/hooks/use-product-page.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("a newer product filter invalidates older page and preview work without replacing the query cache", async () => {
  const requests = [],
    queries = {
      page: (filters) => {
        const request = deferred();
        requests.push({ filters, ...request });
        return request.promise;
      },
      previews: async (rows, options) => {
        if (options.isCurrent()) options.onBatch(rows);
      },
    };
  const page = useProductPage({ queries }),
    first = page.load({ query: "arroz" }),
    second = page.load({ query: "cafe" });
  requests[1].resolve({ items: [{ id: "coffee" }] });
  const fresh = await second;
  requests[0].resolve({ items: [{ id: "rice" }] });
  const stale = await first;
  assert.equal(fresh.isCurrent(), true);
  assert.equal(stale.isCurrent(), false);
  const received = [];
  await page.previews(stale.slice.items, { isCurrent: stale.isCurrent, onBatch: (rows) => received.push(...rows) });
  await page.previews(fresh.slice.items, { isCurrent: fresh.isCurrent, onBatch: (rows) => received.push(...rows) });
  assert.deepEqual(received, [{ id: "coffee" }]);
  assert.deepEqual(
    requests.map((request) => request.filters.query),
    ["arroz", "cafe"],
  );
});

test("leaving a product page suppresses pending results and errors still propagate", async () => {
  let active = true;
  const request = deferred();
  const page = useProductPage({ queries: { page: () => request.promise }, isCurrent: () => active });
  const result = page.load({ page: 1 });
  active = false;
  request.resolve({ items: [] });
  assert.equal((await result).isCurrent(), false);
  active = true;
  const again = page.load({ page: 2 });
  page.invalidate();
  assert.equal((await again).isCurrent(), false);
  const failed = useProductPage({ queries: { page: () => Promise.reject(Error("Sem acesso")) } });
  await assert.rejects(failed.load({}), /Sem acesso/);
});

function previewFixture() {
  const loaders = [];
  const createPreviewLoader = (options) => {
    const pending = deferred();
    const loader = {
      options,
      pending,
      rows: [],
      observed: 0,
      refreshed: 0,
      disposed: false,
      observe(rows) { this.rows = rows; this.observed++; return pending.promise; },
      refresh() { this.refreshed++; return pending.promise; },
      dispose() { this.disposed = true; },
    };
    loaders.push(loader);
    return loader;
  };
  const page = useProductPage({
    queries: { page: async () => ({ items: [{ id: "p", _version: 1 }] }) },
    createPreviewLoader,
  });
  return { page, loaders };
}

test("identical metadata refresh preserves pending previews instead of freezing placeholders", async () => {
  const { page, loaders } = previewFixture();
  const received = [];
  const rows = [{ id: "p", _version: 1 }];
  const first = page.refreshPreviews("same-page", rows, { onBatch: (batch) => received.push(...batch) });
  await page.load({ page: 1 });
  const again = page.refreshPreviews("same-page", rows);
  assert.equal(loaders.length, 1);
  assert.equal(loaders[0].disposed, false);
  assert.equal(loaders[0].refreshed, 1);
  assert.equal(loaders[0].options.isCurrent(), true);
  loaders[0].options.onBatch([{ id: "p", photo: "ready" }]);
  assert.deepEqual(received, [{ id: "p", photo: "ready" }]);
  loaders[0].pending.resolve();
  await Promise.all([first, again]);
});

test("unchanged rendered metadata still refreshes previews for retry and signed URL renewal", async () => {
  const { page, loaders } = previewFixture();
  const task = page.refreshPreviews("same-page", [{ id: "p" }]);
  loaders[0].pending.resolve();
  await task;
  await page.load({ page: 1 });
  await page.refreshPreviews("same-page", [{ id: "p" }]);
  assert.equal(loaders.length, 1);
  assert.equal(loaders[0].refreshed, 1);
});

test("replacing the displayed page disposes old observers and suppresses stale photo updates", async () => {
  const { page, loaders } = previewFixture();
  const received = [];
  const first = page.refreshPreviews("first", [{ id: "p" }], { onBatch: (batch) => received.push(...batch) });
  const second = page.refreshPreviews("second", [{ id: "q" }], { onBatch: (batch) => received.push(...batch) });
  assert.equal(loaders[0].disposed, true);
  assert.equal(loaders[0].options.isCurrent(), false);
  loaders[0].options.onBatch([{ id: "p" }]);
  loaders[1].options.onBatch([{ id: "q" }]);
  assert.deepEqual(received, [{ id: "q" }]);
  page.invalidate();
  assert.equal(loaders[1].disposed, true);
  assert.equal(loaders[1].options.isCurrent(), false);
  loaders.forEach((loader) => loader.pending.resolve());
  await Promise.all([first, second]);
});
