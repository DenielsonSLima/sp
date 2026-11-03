import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesignLibraryController } from '../interno/encartes/design-library.js';
import { createFlyerRepository } from '../interno/encartes/storage.js';
import { createDesign } from '../interno/encartes/model.js';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
const context = () => ({ companyId: 'company', user: { id: 'user' } });

test('deletion removes its own card without a global loading cycle and coalesces its invalidation', async () => {
  const deletion = deferred(),
    snapshots = [];
  let listCalls = 0,
    controller;
  const first = { id: 'first', _version: 1 },
    second = { id: 'second', _version: 2 };
  let rows = [first, second];
  controller = createDesignLibraryController({
    list: async () => {
      listCalls++;
      return rows;
    },
    remove: async (row) => {
      assert.equal(row._version, 1);
      await deletion.promise;
      rows = [second];
      await controller.refresh();
    },
    onRows: (next) => snapshots.push([...next]),
  });
  await controller.refresh();
  assert.equal(listCalls, 1);
  const deleting = controller.remove(first);
  assert.deepEqual(snapshots.at(-1), [first, second]);
  await controller.refresh();
  await controller.refresh();
  assert.equal(listCalls, 1, 'no full refetch while delete is pending');
  deletion.resolve();
  await deleting;
  await settle();
  assert.deepEqual(snapshots.at(-1), [second]);
  assert(
    snapshots.every((rows) => rows.includes(second)),
    'unrelated card remains present throughout',
  );
  assert.equal(listCalls, 2);
  controller.dispose();
});

test('an older list response cannot resurrect a deleted card; failed deletion keeps it visible', async () => {
  const delayed = deferred(),
    first = { id: 'first', _version: 1 },
    second = { id: 'second', _version: 1 },
    snapshots = [];
  let reads = 0;
  const controller = createDesignLibraryController({
    list: async () => (++reads === 1 ? [first, second] : delayed.promise),
    remove: async (row) => {
      if (row.id === 'second') throw Error('Conflito de versão');
    },
    onRows: (rows) => snapshots.push([...rows]),
  });
  await controller.refresh();
  const refreshing = controller.refresh();
  await controller.remove(first);
  delayed.resolve([first, second]);
  await refreshing;
  assert.deepEqual(snapshots.at(-1), [second]);
  await assert.rejects(controller.remove(second), /Conflito/);
  assert.deepEqual(snapshots.at(-1), [second]);
  controller.dispose();
});

test('library responses and delete callbacks stop after disposal or session change', async () => {
  const pending = deferred(),
    snapshots = [];
  let active = true;
  const controller = createDesignLibraryController({
    list: () => pending.promise,
    remove: async () => {},
    onRows: (rows) => snapshots.push(rows),
    isCurrent: () => active,
  });
  const loading = controller.refresh();
  active = false;
  pending.resolve([{ id: 'other-company' }]);
  await loading;
  assert.deepEqual(snapshots, []);
  controller.dispose();
});

test('preview and list refreshes never upgrade the version of the document being edited', async () => {
  const design = { ...createDesign(), _version: 2 },
    reads = [],
    writes = [];
  let server = { ...design };
  const store = createFlyerRepository({
    context,
    list: async () => [server],
    read: async (id) => {
      reads.push(id);
      return server;
    },
    save: async (record, options) => {
      writes.push(options.expectedVersion);
      return { ...record, _version: 3 };
    },
  });
  await store.getDesign(design.id);
  server = { ...server, _version: 9 };
  await store.listDesignSummaries();
  await store.getDesign(design.id, { preview: true, expectedVersion: 9 });
  await store.saveDesign(design);
  assert.deepEqual(writes, [2], 'must send the version opened by the user, not a newer preview version');
  assert.equal(reads.length, 1, 'preview reuses full document already read with the list');
});

test('library summaries omit full artwork and deletion sends the displayed version and blocks autosave resurrection', async () => {
  const design = { ...createDesign(), _version: 4 },
    deleted = [];
  const store = createFlyerRepository({
    context,
    list: async () => [design],
    remove: async (id, options) => {
      deleted.push({ id, ...options });
    },
    save: async () => {
      throw Error('unexpected write');
    },
  });
  const [row] = await store.listDesignSummaries();
  assert.equal(row.elements, undefined);
  assert.equal(row.bgColor, undefined);
  assert.equal(row._version, 4);
  await store.deleteDesign(row.id, { expectedVersion: row._version });
  assert.deepEqual(deleted, [{ id: row.id, expectedVersion: 4 }]);
  await assert.rejects(store.saveDesign(design), /excluída/);
});

test('flyer caches and deletion tombstones do not cross companies', async () => {
  let company = 'a';
  const design = { ...createDesign(), _version: 1 };
  const versions = [];
  const store = createFlyerRepository({
    context: () => ({ companyId: company, user: { id: 'user' } }),
    read: async () => design,
    remove: async () => {},
    save: async (record, options) => {
      versions.push(options.expectedVersion);
      return { ...record, _version: 1 };
    },
  });
  await store.getDesign(design.id);
  await store.deleteDesign(design.id);
  company = 'b';
  await store.saveDesign({ ...design, _version: undefined });
  assert.deepEqual(versions, [null]);
});

test('clearing flyer state for a session change rejects late reads even when the same account logs back in', async () => {
  const pending = deferred(),
    design = { ...createDesign(), _version: 2 };
  const store = createFlyerRepository({ context, read: () => pending.promise });
  const loading = store.getDesign(design.id);
  store.clear();
  pending.resolve(design);
  await assert.rejects(loading, /sessão ou empresa ativa mudou/);
});

test('metadata lists leave full documents unloaded until a preview or editor requests one', async () => {
  const document = { ...createDesign(), _version: 7 },
    reads = [];
  const metadata = {
    id: document.id,
    title: document.title,
    status: document.status,
    width: document.width,
    height: document.height,
    _version: 7,
  };
  const store = createFlyerRepository({
    context,
    list: async () => [metadata],
    read: async (id) => {
      reads.push(id);
      return document;
    },
  });
  assert.deepEqual(await store.listDesignSummaries(), [metadata]);
  assert.deepEqual(reads, [], 'opening a list must not read embedded images');
  await store.getDesign(document.id, { preview: true, expectedVersion: 7 });
  await store.listDesignSummaries();
  await store.getDesign(document.id, { preview: true, expectedVersion: 7 });
  assert.deepEqual(reads, [document.id], 'unchanged previews retain their individual document cache');
  await store.getDesign(document.id);
  assert.equal(reads.length, 2, 'opening the editor revalidates the document and its concurrency version');
});
