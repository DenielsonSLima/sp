import test from 'node:test';
import assert from 'node:assert/strict';
import { createNameAutosave } from '../interno/promocoes/hooks/use-name-autosave.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('ten input events and change persist only the final name once', async () => {
  const writes = [], saved = [];
  const queue = createNameAutosave(async (...args) => { writes.push(args); }, {
    delay: 10000, onSaved: (...args) => saved.push(args.slice(0, 2)),
  });
  queue.register('item', '');
  for (let index = 1; index <= 10; index++) queue.schedule('item', '1234567890'.slice(0, index));
  queue.schedule('item', '1234567890');
  await queue.flush('item');
  await queue.flush('item');
  assert.deepEqual(writes, [['item', '1234567890']]);
  assert.deepEqual(saved.at(-1), ['item', '1234567890']);
  queue.dispose();
});

test('a slow save drains only the newest value and cannot clear a newer raw draft', async () => {
  const first = deferred(), writes = [], saved = [];
  const queue = createNameAutosave(async (_id, value) => {
    writes.push(value);
    if (writes.length === 1) await first.promise;
  }, { delay: 10000, onSaved: (_id, value) => saved.push(value) });
  queue.register('item', 'Original');
  queue.schedule('item', 'First');
  const pending = queue.flush('item');
  await tick();
  queue.schedule('item', 'Second');
  queue.schedule('item', 'Newest');
  const overlapping = queue.flush('item');
  assert.deepEqual(writes, ['First']);
  first.resolve();
  await Promise.all([pending, overlapping]);
  assert.deepEqual(writes, ['First', 'Newest']);
  assert.deepEqual(saved, ['Newest']);
  queue.dispose();
});

test('failed values remain retryable and returning to the original needs no write', async () => {
  const writes = [], errors = [], saved = [];
  let fail = true;
  const queue = createNameAutosave(async (_id, value) => {
    writes.push(value);
    if (fail) throw Error('Version conflict');
  }, { delay: 10000, onError: (error) => errors.push(error.message), onSaved: (_id, value) => saved.push(value) });
  queue.register('item', 'Original');
  queue.schedule('item', 'Changed');
  await assert.rejects(queue.flush(), /Version conflict/);
  assert.deepEqual(saved, []);
  fail = false;
  await queue.flush();
  assert.deepEqual(writes, ['Changed', 'Changed']);
  queue.schedule('item', 'Temporary');
  queue.schedule('item', 'Changed');
  await queue.flush();
  assert.equal(writes.length, 2);
  assert.equal(saved.at(-1), 'Changed');
  assert.deepEqual(errors, ['Version conflict']);
  queue.dispose();
});

test('context change suppresses late callbacks and queued follow-up saves', async () => {
  let current = true;
  const first = deferred(), writes = [], saved = [];
  const queue = createNameAutosave(async (_id, value) => {
    writes.push(value); await first.promise;
  }, { delay: 10000, isCurrent: () => current, onSaved: (...args) => saved.push(args) });
  queue.register('item', '');
  queue.schedule('item', 'First');
  const pending = queue.flush();
  queue.schedule('item', 'Second');
  current = false;
  queue.dispose();
  first.resolve();
  await assert.rejects(pending, /sessão ou empresa/);
  assert.deepEqual(writes, ['First']);
  assert.deepEqual(saved, []);
});
