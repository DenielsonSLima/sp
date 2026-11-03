import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue } from '../interno/encartes/editor/save-queue.js';
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));

test('slow writes retain only the latest waiting snapshot and resolve every caller after it is saved', async () => {
  const queue = createSaveQueue(),
    first = deferred(),
    latest = deferred(),
    writes = [];
  const a = queue.enqueue('company:document', async () => {
    writes.push('a');
    await first.promise;
    return 'a';
  });
  await turn();
  const b = queue.enqueue('company:document', async () => {
    writes.push('b');
    return 'b';
  });
  const c = queue.enqueue('company:document', async () => {
    writes.push('c');
    await latest.promise;
    return 'c';
  });
  let bFinished = false,
    idleFinished = false;
  b.then(() => {
    bFinished = true;
  });
  const idle = queue.whenIdle().then(() => {
    idleFinished = true;
  });
  first.resolve();
  await a;
  await turn();
  assert.deepEqual(writes, ['a', 'c']);
  assert.equal(bFinished, false, 'superseded snapshot waits for the replacement write');
  assert.equal(idleFinished, false, 'deletion/navigation must wait for the latest queued save');
  latest.resolve();
  assert.deepEqual(await Promise.all([b, c]), ['c', 'c']);
  await idle;
});

test('save failure rejects its callers without blocking a later retry or a different document', async () => {
  const queue = createSaveQueue(),
    writes = [];
  const failed = queue.enqueue('a', async () => {
    writes.push('failed');
    throw Error('Version conflict');
  });
  const other = queue.enqueue('b', async () => {
    writes.push('other');
    return 2;
  });
  await assert.rejects(failed, /Version conflict/);
  assert.equal(await other, 2);
  assert.equal(
    await queue.enqueue('a', async () => {
      writes.push('retry');
      return 3;
    }),
    3,
  );
  await queue.whenIdle();
  assert.deepEqual(writes, ['failed', 'other', 'retry']);
});

test('obsolete session checks run at write time and pending work never crosses scope keys', async () => {
  const queue = createSaveQueue(),
    held = deferred();
  let scope = 'old',
    writes = 0;
  const running = queue.enqueue('old:document', () => held.promise);
  await turn();
  const stale = queue.enqueue('old:document', async () => {
    if (scope !== 'old') throw Error('Session changed');
    writes++;
  });
  scope = 'new';
  const fresh = queue.enqueue('new:document', async () => {
    writes++;
    return 'new';
  });
  const rejected = assert.rejects(stale, /Session changed/);
  held.resolve();
  await running;
  await rejected;
  assert.equal(await fresh, 'new');
  assert.equal(writes, 1);
});
