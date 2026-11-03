import test from 'node:test';
import assert from 'node:assert/strict';
import { usePagedList } from '../interno/hooks/use-paged-list.js';

class Node {
  constructor() {
    this.children = [];
    this.parent = null;
    this.isConnected = true;
    this.attributes = new Map();
    this.textContent = '';
    this.inert = false;
    this.classList = { add() {} };
  }
  set innerHTML(value) { this.html = value; this.replaceChildren(); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  replaceChildren() { this.children.forEach((node) => { node.parent = null; }); this.children = []; }
  contains(node) { return this.children.includes(node) || this.children.some((child) => child.contains(node)); }
  insertBefore(node, reference) {
    node.remove();
    const index = reference ? this.children.indexOf(reference) : this.children.length;
    assert.ok(index >= 0);
    this.children.splice(index, 0, node);
    node.parent = this;
  }
  replaceWith(node) {
    const parent = this.parent;
    if (!parent) return;
    const index = parent.children.indexOf(this);
    parent.children[index] = node;
    node.parent = parent;
    this.parent = null;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
}

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const result = (items, page = 1) => ({ items, page, pages: 3, total: 60, from: 1, to: items.length });

function fixture() {
  const root = new Node(), grid = new Node(), count = new Node(), error = new Node(), pagination = new Node();
  root.insertBefore(grid, null);
  const controls = Object.fromEntries(['prev', 'next', 'label', 'retry'].map((key) => [`[data-page-${key}]`, new Node()]));
  pagination.querySelector = (selector) => controls[selector];
  globalThis.document = {
    body: root,
    createElement: () => ({
      content: {},
      set innerHTML(html) { const node = new Node(); node.html = html; this.content.firstElementChild = node; },
    }),
  };
  globalThis.MutationObserver = class { observe() {} disconnect() { this.disconnected = true; } };
  const requests = [], pages = [], filters = {};
  const controller = usePagedList(root, {
    grid, count, error, pagination, filters,
    card: (row) => `<article>${row.id}:${row.name}</article>`,
    load: (requested) => { const request = deferred(); requests.push({ requested, ...request }); return request.promise; },
    onPage: (page) => pages.push(page),
  });
  return { controller, requests, root, grid, count, error, controls, pagination, pages, filters };
}

test('page refresh preserves unchanged card nodes and updates only changed, removed and inserted records', async () => {
  const f = fixture();
  let task = f.controller.refresh();
  f.requests[0].resolve(result([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]));
  await task;
  const [a, b, c] = f.grid.children;
  task = f.controller.refresh();
  assert.deepEqual(f.grid.children, [a, b, c], 'existing cards remain mounted while loading');
  f.requests[1].resolve(result([{ id: 'c', name: 'C' }, { id: 'b', name: 'Changed' }, { id: 'd', name: 'D' }]));
  await task;
  assert.equal(f.grid.children[0], c, 'unchanged reordered card retains identity and handlers');
  assert.notEqual(f.grid.children[1], b);
  assert.equal(f.grid.children[1].html, '<article>b:Changed</article>');
  assert.equal(f.grid.children[2].html, '<article>d:D</article>');
  assert.equal(a.parent, null);
  f.controller.dispose();
});

test('latest filter wins, stale responses do not unlock grid or replace newer results, pager pauses while loading', async () => {
  const f = fixture();
  const old = f.controller.refresh();
  const fresh = f.controller.change({ query: 'coffee' });
  assert.equal(f.grid.inert, true);
  assert.equal(f.controls['[data-page-next]'].disabled, true);
  f.requests[0].resolve(result([{ id: 'old', name: 'Old' }]));
  await old;
  assert.equal(f.grid.inert, true);
  assert.equal(f.grid.children.length, 0);
  f.requests[1].resolve(result([{ id: 'new', name: 'Coffee' }]));
  await fresh;
  assert.equal(f.requests[1].requested.query, 'coffee');
  assert.equal(f.grid.inert, false);
  assert.equal(f.controls['[data-page-next]'].disabled, false);
  assert.equal(f.pages.length, 1);
  f.controller.dispose();
});

test('failed filter exposes retry and preserves cards without allowing actions against the previous filter', async () => {
  const f = fixture();
  const first = f.controller.refresh();
  f.requests[0].resolve(result([{ id: 'a', name: 'A' }]));
  await first;
  const card = f.grid.children[0];
  const failed = f.controller.change({ status: 'finished' });
  f.requests[1].reject(Error('Falha temporária'));
  await failed;
  assert.equal(f.error.textContent, 'Falha temporária');
  assert.equal(f.controls['[data-page-retry]'].hidden, false);
  assert.equal(f.pagination.hidden, false);
  assert.equal(f.controls['[data-page-label]'].hidden, true, 'a failed filter must not display a stale page count');
  assert.equal(f.grid.children[0], card);
  assert.equal(f.grid.inert, true);
  assert.equal(f.grid.attributes.has('aria-busy'), false);
  const retry = f.controls['[data-page-retry]'].onclick();
  assert.equal(f.controls['[data-page-retry]'].hidden, true, 'retry is hidden while its request runs');
  f.requests[2].resolve(result([{ id: 'b', name: 'B' }], 2));
  await retry;
  assert.equal(f.requests[2].requested.status, 'finished');
  assert.equal(f.grid.inert, false);
  assert.equal(f.controls['[data-page-retry]'].hidden, true);
  assert.equal(f.filters.page, 2);
  f.controller.dispose();
});

test('pagination is absent for an empty or single page and shown only when navigation is possible', async () => {
  const f = fixture();
  assert.equal(f.pagination.hidden, true);
  const single = f.controller.refresh();
  f.requests[0].resolve({ ...result([{ id: 'a', name: 'A' }]), pages: 1, total: 1 });
  await single;
  assert.equal(f.pagination.hidden, true);
  assert.equal(f.controls['[data-page-retry]'].hidden, true);
  assert.equal(f.controls['[data-page-label]'].textContent, '');

  const multiple = f.controller.refresh();
  f.requests[1].resolve(result([{ id: 'a', name: 'A' }], 2));
  await multiple;
  assert.equal(f.pagination.hidden, false);
  assert.equal(f.controls['[data-page-label]'].textContent, 'Página 2 de 3');
  assert.equal(f.controls['[data-page-prev]'].disabled, false);
  assert.equal(f.controls['[data-page-next]'].disabled, false);
  assert.equal(f.controls['[data-page-retry]'].hidden, true);

  const empty = f.controller.change({ query: 'missing' });
  f.requests[2].resolve({ ...result([]), pages: 0, total: 0 });
  await empty;
  assert.equal(f.pagination.hidden, true);
  assert.equal(f.controls['[data-page-retry]'].hidden, true);
  f.controller.dispose();
});

test('failure on a single page exposes retry and successful recovery removes the whole footer', async () => {
  const f = fixture();
  const failed = f.controller.refresh();
  f.requests[0].reject(Error('Conexão interrompida'));
  await failed;
  assert.equal(f.pagination.hidden, false);
  assert.equal(f.controls['[data-page-retry]'].hidden, false);
  assert.equal(f.controls['[data-page-prev]'].hidden, true);
  assert.equal(f.controls['[data-page-next]'].hidden, true);

  const retry = f.controls['[data-page-retry]'].onclick();
  assert.equal(f.pagination.hidden, true);
  f.requests[1].resolve({ ...result([{ id: 'a', name: 'A' }]), pages: 1, total: 1 });
  await retry;
  assert.equal(f.error.textContent, '');
  assert.equal(f.pagination.hidden, true);
  f.controller.dispose();
});

test('leaving a view suppresses pending results and dispose cancels debounced searches', async () => {
  const f = fixture();
  const pending = f.controller.refresh();
  f.root.isConnected = false;
  f.requests[0].resolve(result([{ id: 'late', name: 'Late' }]));
  await pending;
  assert.equal(f.grid.children.length, 0);
  f.root.isConnected = true;
  f.controller.change({ query: 'queued' }, { debounce: true });
  f.controller.dispose();
  await new Promise((resolve) => setTimeout(resolve, 280));
  assert.equal(f.requests.length, 1);
});
