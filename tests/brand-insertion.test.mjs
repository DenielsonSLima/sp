import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrandInsertion } from '../interno/encartes/editor/brand-insertion.js';

const asset = { id: 'seal', name: 'Natal da Economia', _version: 4 };
const full = { ...asset, dataURL: 'data:image/png;base64,AAAA', width: 800, height: 500 };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const states = [], inserted = [];
  const insertion = createBrandInsertion({
    read: async () => full, onInsert: value => inserted.push(value),
    isCurrent: () => true, onState: value => states.push(value), ...options,
  });
  return { insertion, states, inserted };
}

test('a pending click shows progress, keeps the viewed version and blocks duplicate clicks', async () => {
  const job = deferred(), calls = [];
  const env = fixture({ read: (...args) => { calls.push(args); return job.promise; } });
  const adding = env.insertion.insert(asset);
  assert.equal(env.states[0].state, 'loading');
  assert.equal(await env.insertion.insert(asset), false);
  assert.deepEqual(calls, [['seal', 4]]);
  job.resolve(full);
  assert.equal(await adding, true);
  assert.deepEqual(env.inserted, [full]);
  assert.equal(env.states.at(-1).state, 'success');
});

test('a stalled original releases the UI, permits retry and never inserts its late response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const job = deferred();
  let reads = 0;
  const env = fixture({ read: () => ++reads === 1 ? job.promise : full });
  const adding = env.insertion.insert(asset);
  t.mock.timers.tick(20_000);
  assert.equal(await adding, false);
  assert.equal(env.states.at(-1).state, 'error');
  assert.match(env.states.at(-1).error.message, /tentar novamente/);
  assert.equal(await env.insertion.insert(asset), true);
  job.resolve(full);
  await flush();
  assert.deepEqual(env.inserted, [full]);
});

test('backend failures and invalid PNGs never display insertion success and can be retried', async () => {
  let reads = 0;
  const env = fixture({ read: async () => {
    if (++reads === 1) throw Error('Conflito de versão');
    return { ...full, width: 0 };
  } });
  assert.equal(await env.insertion.insert(asset), false);
  assert.match(env.states.at(-1).error.message, /Conflito/);
  assert.equal(await env.insertion.insert(asset), false);
  assert.match(env.states.at(-1).error.message, /dimensões válidas/);
  assert.deepEqual(env.inserted, []);
  const rejected = fixture({ onInsert: () => false });
  assert.equal(await rejected.insertion.insert(asset), false);
  assert.equal(rejected.states.at(-1).state, 'error');
});

test('leaving the folder or session cancels insertion and ignores late results and errors', async () => {
  for (const fail of [false, true]) {
    const job = deferred();
    const env = fixture({ read: () => job.promise });
    const adding = env.insertion.insert(asset);
    env.insertion.cancel();
    assert.equal(await adding, false);
    if (fail) job.reject(Error('Old request'));
    else job.resolve(full);
    await flush();
    assert.deepEqual(env.inserted, []);
    assert.deepEqual(env.states.map(value => value.state), ['loading']);
  }
  let active = true;
  const job = deferred(), env = fixture({ read: () => job.promise, isCurrent: () => active });
  const adding = env.insertion.insert(asset);
  active = false;
  job.resolve(full);
  assert.equal(await adding, false);
  assert.deepEqual(env.inserted, []);
});
