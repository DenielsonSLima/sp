import test from 'node:test';
import assert from 'node:assert/strict';
import { openPromotionDialog } from '../interno/tabela-precos/views/promotion-dialog.js';

function fixture(t) {
  const previous = { document: globalThis.document, FormData: globalThis.FormData };
  const name = { value: 'Ofertas da semana', focus() { this.focused = true; } };
  const start = { value: '2026-11-03' }, end = { value: '2026-11-09' };
  const notes = { value: 'Enquanto durar o estoque' }, submit = {}, cancel = {}, status = {};
  const fields = { name, start, end, notes };
  const form = { elements: fields, reportValidity: () => true,
    querySelectorAll: () => [...Object.values(fields), submit, cancel] };
  class FakeDialog extends EventTarget {
    open = false; isConnected = true; attributes = {};
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) {
      return { form, '.tp-promotion-save': submit, '[data-cancel]': cancel, '.tp-status': status }[selector];
    }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    remove() { this.isConnected = false; }
  }
  globalThis.document = { createElement: () => new FakeDialog() };
  globalThis.FormData = class {
    constructor() { this.values = Object.entries(fields).map(([key, field]) => [key, field.value]); }
    [Symbol.iterator]() { return this.values[Symbol.iterator](); }
  };
  let dialog;
  const root = { append(node) { dialog = node; } };
  t.after(() => { globalThis.document = previous.document; globalThis.FormData = previous.FormData; });
  return { root, form, name, start, end, notes, submit, cancel, status, get dialog() { return dialog; } };
}

test('promotion creation saves the four header fields before opening the product screen', async t => {
  const env = fixture(t); let received, opened;
  openPromotionDialog(env.root, {
    onSave: async input => { received = input; return { id: 'saved', ...input }; },
    onSaved: record => { opened = record.id; },
  });
  assert(env.dialog.open); assert(env.name.focused);
  assert.equal(env.dialog.attributes['aria-labelledby'], 'tp-promotion-title');
  assert.match(env.dialog.innerHTML, /Nome da promoção/);
  assert.match(env.dialog.innerHTML, /Data inicial/);
  assert.match(env.dialog.innerHTML, /Data final/);
  assert.match(env.dialog.innerHTML, /Observação/);
  assert.equal(received, undefined, 'opening the dialog must not create a draft');
  await env.form.onsubmit(new Event('submit', { cancelable: true }));
  assert.deepEqual(received, { name: env.name.value, start: env.start.value, end: env.end.value, notes: env.notes.value });
  assert.equal(opened, 'saved'); assert(!env.dialog.isConnected);
});

test('failed promotion saves retain fields and allow retry while pending saves reject duplicate submits', async t => {
  const env = fixture(t); let reject, calls = 0;
  openPromotionDialog(env.root, { onSave: () => { calls++; return new Promise((_, fail) => { reject = fail; }); } });
  const saving = env.form.onsubmit(new Event('submit', { cancelable: true }));
  await env.form.onsubmit(new Event('submit', { cancelable: true }));
  assert.equal(calls, 1); assert(env.submit.disabled); assert(env.cancel.disabled);
  const escape = new Event('cancel', { cancelable: true }); env.dialog.dispatchEvent(escape);
  assert(escape.defaultPrevented); assert(env.dialog.open);
  reject(Error('A promoção mudou em outra aba.')); await saving;
  assert(env.dialog.open); assert.equal(env.notes.value, 'Enquanto durar o estoque');
  assert.match(env.status.textContent, /outra aba/); assert.equal(env.submit.disabled, false);
});

test('cancel does not create a promotion and a late response cannot open a different company', async t => {
  const env = fixture(t); let calls = 0;
  openPromotionDialog(env.root, { onSave: () => { calls++; } });
  env.cancel.onclick(); assert.equal(calls, 0); assert(!env.dialog.isConnected);
  let current = true, resolve, opens = 0;
  openPromotionDialog(env.root, {
    isCurrent: () => current,
    onSave: () => new Promise(done => { resolve = done; }),
    onSaved: () => { opens++; },
  });
  const saving = env.form.onsubmit(new Event('submit', { cancelable: true }));
  current = false; resolve({ id: 'old-company' }); await saving;
  assert.equal(opens, 0); assert(!env.dialog.isConnected);
});
