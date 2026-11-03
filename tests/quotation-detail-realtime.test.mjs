import test from 'node:test';
import assert from 'node:assert/strict';
import { useDetailRealtime } from '../interno/cotacao/hooks/use-detail-realtime.js';

function fixture(t) {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({}) };
  t.after(() => { globalThis.document = previous; });
  let callback, busy = false, current = true, remote = { id: 'q', _version: 2 };
  const accepted = [], quote = { id: 'q', _version: 1 }, notice = {
    children: [], replaceChildren() { this.children = []; }, append(...nodes) { this.children.push(...nodes); },
  };
  const hook = useDetailRealtime({
    root: { querySelector: () => notice }, quote, isCurrent: () => current, isBusy: () => busy,
    watch: (_root, fn) => { callback = fn; return () => {}; },
    read: async () => remote,
    accept: record => accepted.push(record), apply: record => Object.assign(quote, record),
  });
  return { hook, quote, notice, accepted, notify: () => callback(),
    busy: value => { busy = value; }, leave: () => { current = false; }, remote: value => { remote = value; } };
}

test('remote signal announces newer quote without advancing viewed version or overwriting drafts', async t => {
  const f = fixture(t);
  f.busy(true); await f.notify();
  assert.equal(f.notice.hidden, false);
  assert.equal(f.notice.children[1].disabled, true);
  assert.equal(f.quote._version, 1);
  assert.deepEqual(f.accepted, []);
  await f.notice.children[1].onclick();
  assert.deepEqual(f.accepted, []);
  f.busy(false); f.hook.sync();
  await f.notice.children[1].onclick();
  assert.equal(f.quote._version, 2);
  assert.equal(f.accepted.length, 1);
  assert.equal(f.notice.hidden, true);
});

test('own acknowledgement does not display a stale remote warning', async t => {
  const f = fixture(t);
  f.quote._version = 2; await f.notify();
  assert.equal(f.notice.hidden, true);
  f.leave(); f.remote({ id: 'q', _version: 3 }); await f.notify();
  assert.equal(f.quote._version, 2);
  assert.deepEqual(f.accepted, []);
});
