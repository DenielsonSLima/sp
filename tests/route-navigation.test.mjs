import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteNavigation } from '../interno/route-navigation.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(t) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let replacements = 0, scrolls = 0;
  const root = {
    isConnected: true,
    querySelector(selector) { return selector === '#content' ? this.content : null; },
  };
  function node() {
    return {
      isConnected: false, attrs: new Map(), innerHTML: '', textContent: '', focused: false,
      setAttribute(name, value) { this.attrs.set(name, value); },
      removeAttribute(name) { this.attrs.delete(name); },
      focus() { this.focused = true; },
      replaceWith(next) {
        this.isConnected = false;
        next.isConnected = true;
        root.content = next;
        replacements++;
      },
    };
  }
  root.content = node();
  root.content.innerHTML = '<section>Current screen</section>';
  root.content.isConnected = true;
  globalThis.document = { createElement: node };
  globalThis.window = { scrollTo() { scrolls++; } };
  t.after(() => { globalThis.document = previousDocument; globalThis.window = previousWindow; });
  return { root, navigation: createRouteNavigation(), get replacements() { return replacements; }, get scrolls() { return scrolls; } };
}

test('module import preserves the current screen until the replacement can render', async (t) => {
  const env = fixture(t), loading = deferred(), previous = env.root.content;
  const pending = env.navigation.open(env.root, { href: '#cotacao', activeModule: { load: () => loading.promise } });
  assert.equal(env.root.content, previous);
  assert.equal(previous.innerHTML, '<section>Current screen</section>');
  assert.equal(previous.attrs.get('aria-busy'), 'true');
  assert.equal(previous.inert, true);
  loading.resolve({ render(root) { root.innerHTML = '<section>Cotações</section>'; } });
  await pending;
  assert.equal(env.replacements, 1);
  assert.equal(previous.isConnected, false);
  assert.equal(env.root.content.innerHTML, '<section>Cotações</section>');
  assert.equal(env.root.content.attrs.has('aria-busy'), false);
  assert.equal(env.root.content.focused, true);
});

test('duplicate renders of the same route retain its DOM, draft and pending import', async (t) => {
  const env = fixture(t), loading = deferred();
  let loads = 0;
  const route = { href: '#cotacao/123', activeModule: { load() { loads++; return loading.promise; } } };
  const pending = env.navigation.open(env.root, route);
  assert.equal(env.navigation.open(env.root, route), pending);
  loading.resolve({ render(root) { root.draft = 'unsaved quantity'; } });
  await pending;
  const content = env.root.content;
  await env.navigation.open(env.root, route);
  assert.equal(env.root.content, content);
  assert.equal(env.root.content.draft, 'unsaved quantity');
  assert.equal(loads, 1);
  assert.equal(env.replacements, 1);
});

test('rapid navigation commits only the latest route even when imports finish out of order', async (t) => {
  const env = fixture(t), first = deferred(), second = deferred();
  let staleRenders = 0;
  const old = env.navigation.open(env.root, { href: '#cotacao', activeModule: { load: () => first.promise } });
  const latest = env.navigation.open(env.root, { href: '#calendario', activeModule: { load: () => second.promise } });
  second.resolve({ render(root) { root.innerHTML = '<section>Calendário</section>'; } });
  await latest;
  first.resolve({ render() { staleRenders++; } });
  await old;
  assert.equal(env.root.content.innerHTML, '<section>Calendário</section>');
  assert.equal(staleRenders, 0);
  assert.equal(env.replacements, 1);
  assert.equal(env.scrolls, 1);
});

test('leaving the session cancels a pending import and allows the same route in the next session', async (t) => {
  const env = fixture(t), loading = deferred();
  let staleRenders = 0;
  const old = env.navigation.open(env.root, { href: '#cotacao', activeModule: { load: () => loading.promise } });
  env.navigation.reset();
  loading.resolve({ render() { staleRenders++; } });
  await old;
  assert.equal(staleRenders, 0);
  await env.navigation.open(env.root, { href: '#cotacao', activeModule: { load: async () => ({ render(root) { root.textContent = 'New session'; } }) } });
  assert.equal(env.root.content.textContent, 'New session');
});

test('a failed import can be retried without locking the same route', async (t) => {
  const env = fixture(t);
  t.mock.method(console, 'error', () => {});
  const route = { href: '#cotacao', activeModule: { load: async () => { throw Error('Failed to load module'); } } };
  await env.navigation.open(env.root, route);
  assert.equal(env.root.content.textContent, 'Failed to load module');
  assert.equal(env.root.content.attrs.has('aria-busy'), false);
  route.activeModule.load = async () => ({ render(root) { root.textContent = 'Recovered'; } });
  await env.navigation.open(env.root, route);
  assert.equal(env.root.content.textContent, 'Recovered');
});

test('module authorization is checked before import and render', async (t) => {
  const env = fixture(t);
  t.mock.method(console, 'error', () => {});
  let loaded = false;
  await env.navigation.open(env.root, { href: '#configuracoes', allowed: false, activeModule: { load() { loaded = true; } } });
  assert.equal(loaded, false);
  assert.match(env.root.content.textContent, /não tem acesso/);
});
