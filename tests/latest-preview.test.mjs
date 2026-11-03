import test from 'node:test';
import assert from 'node:assert/strict';
import { useLatestPreview } from '../interno/hooks/use-latest-preview.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('slow preview keeps one RPC active and sends only the latest queued snapshot', async () => {
  const calls = [], results = [];
  let active = 0, maximum = 0;
  const preview = useLatestPreview({
    delay: 100000,
    run: (input) => {
      maximum = Math.max(maximum, ++active);
      return new Promise((resolve) => calls.push({ input, resolve: (value) => { active--; resolve(value); } }));
    },
    onResult: (value) => results.push(value),
  });
  const input = { items: [{ quantity: '1' }] };
  preview.schedule(input);
  const drained = preview.flush();
  await tick();
  input.items[0].quantity = '2';
  preview.schedule(input);
  preview.flush();
  input.items[0].quantity = '3';
  preview.schedule(input);
  assert.equal(preview.flush(), drained);
  input.items[0].quantity = 'not scheduled';
  assert.deepEqual(calls.map(({ input }) => input.items[0].quantity), ['1']);
  calls[0].resolve('old result');
  await tick();
  assert.deepEqual(calls.map(({ input }) => input.items[0].quantity), ['1', '3']);
  assert.deepEqual(results, []);
  calls[1].resolve('latest result');
  await drained;
  assert.equal(maximum, 1);
  assert.deepEqual(results, ['latest result']);
  preview.dispose();
});

test('obsolete preview failure does not replace a newer valid input with an error', async () => {
  const calls = [], results = [], errors = [];
  const preview = useLatestPreview({
    delay: 100000,
    run: (input) => new Promise((resolve, reject) => calls.push({ input, resolve, reject })),
    onResult: (value) => results.push(value),
    onError: (error) => errors.push(error.message),
  });
  preview.schedule('invalid');
  const drained = preview.flush();
  await tick();
  preview.schedule('corrected');
  preview.flush();
  calls[0].reject(Error('Old validation failure'));
  await tick();
  assert.equal(calls[1].input, 'corrected');
  calls[1].resolve('valid total');
  await drained;
  assert.deepEqual(errors, []);
  assert.deepEqual(results, ['valid total']);
  preview.schedule('current invalid');
  const failed = preview.flush();
  await tick();
  calls[2].reject(Error('Current validation failure'));
  await failed;
  assert.deepEqual(errors, ['Current validation failure']);
  preview.dispose();
});

test('detached views do not start queued RPCs or accept late responses', async () => {
  let current = true, calls = 0, release;
  const results = [];
  const preview = useLatestPreview({
    delay: 100000,
    isCurrent: () => current,
    run: () => { calls++; return new Promise((resolve) => { release = resolve; }); },
    onResult: (value) => results.push(value),
  });
  preview.schedule('first');
  const drained = preview.flush();
  await tick();
  preview.schedule('queued');
  preview.flush();
  current = false;
  release('late result');
  await drained;
  assert.equal(calls, 1);
  assert.deepEqual(results, []);
  preview.schedule('detached');
  await preview.flush();
  assert.equal(calls, 1);
  preview.dispose();
});

test('disposing before the debounce cancels work, including flush', async () => {
  let calls = 0;
  const preview = useLatestPreview({ run: () => calls++, onResult: () => {}, delay: 100000 });
  preview.schedule('input');
  preview.dispose();
  await preview.flush();
  assert.equal(calls, 0);
});
