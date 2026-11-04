import test from 'node:test';
import assert from 'node:assert/strict';
import { openPromotionProductPicker } from '../interno/tabela-precos/views/promotion-picker.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const png = 'data:image/png;base64,aGVsbG8=';
function fixture(t) {
  const previous = globalThis.document;
  const nodes = Object.fromEntries(['.tp-picker-search', '.tp-picker-page-check', '.tp-picker-count', '.tp-picker-add',
    '.tp-picker-prev', '.tp-picker-next', '[data-cancel]', '.tp-status', '.tp-picker-grid', '.tp-picker-page']
    .map(key => [key, { value: '', innerHTML: '', focus() { this.focused = true; } }]));
  let rendered = '', inputs = [], photos = [], dialog;
  function checks() {
    const markup = nodes['.tp-picker-grid'].innerHTML;
    if (markup !== rendered) {
      rendered = markup;
      inputs = [...markup.matchAll(/data-product-check="([^"]+)"([^>]*)>/g)].map(match => {
        const state = {}, classes = new Set();
        const card = { classes, classList: { toggle(value, selected) { selected ? classes.add(value) : classes.delete(value); } },
          querySelector: () => state };
        return { dataset: { productCheck: match[1] }, checked: match[2].includes('checked'),
          disabled: match[2].includes('disabled'), closest: () => card, card, state };
      });
      photos = [...markup.matchAll(/data-picker-photo="([^"]+)"/g)].map(match => ({ dataset: { pickerPhoto: match[1] }, innerHTML: '' }));
    }
    return inputs;
  }
  class FakeDialog extends EventTarget {
    open = false; isConnected = true; attributes = {};
    setAttribute(name, value) { this.attributes[name] = value; }
    querySelector(selector) { return nodes[selector]; }
    querySelectorAll(selector) { checks(); return selector === '[data-product-check]' ? inputs : selector === '[data-picker-photo]' ? photos : []; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    remove() { this.isConnected = false; }
  }
  globalThis.document = { createElement: () => new FakeDialog() };
  const root = { append(node) { dialog = node; } };
  t.after(() => { if (dialog?.open) dialog.close(); globalThis.document = previous; });
  return { root, nodes, checks, get photos() { checks(); return photos; }, get dialog() { return dialog; },
    select(id, checked = true) {
      const input = checks().find(input => input.dataset.productCheck === id); assert(input);
      input.checked = checked; nodes['.tp-picker-grid'].onchange({ target: input }); return input;
    },
  };
}

test('catalog selection survives pages, excludes existing products and submits every chosen ID in one call', async t => {
  const env = fixture(t), pages = [], calls = [], previews = [];
  openPromotionProductPicker(env.root, {
    selectedIds: ['existing'],
    loadPage: async ({ page }) => { pages.push(page); return { page, total: 21, items: page === 1
      ? [{ id: 'existing', name: 'Arroz já adicionado' }, { id: 'coffee', name: 'Café <especial>', code: 'CAF-2', unit: 'UN' }]
      : [{ id: 'banana', name: 'Banana' }] }; },
    loadPreviews: async (rows, options) => { previews.push(rows.map(row => row.id)); options.onBatch(rows.map(row => ({ ...row, photo: png }))); },
    onAdd: async ids => { calls.push(ids); return { id: 'promotion' }; },
  });
  await tick();
  assert(env.dialog.open); assert(env.nodes['.tp-picker-search'].focused);
  assert.match(env.dialog.innerHTML, /tp-picker-list/);
  assert.match(env.dialog.innerHTML, /<span>Foto<\/span><span>Produto<\/span><span>Código<\/span><span>Unidade<\/span><span>Seleção<\/span>/);
  assert(env.checks().find(input => input.dataset.productCheck === 'existing').disabled);
  assert.match(env.nodes['.tp-picker-grid'].innerHTML, /Café &lt;especial&gt;/);
  assert.match(env.nodes['.tp-picker-grid'].innerHTML, /tp-picker-code">CAF-2/);
  assert.match(env.nodes['.tp-picker-grid'].innerHTML, /tp-picker-unit">UN/);
  assert(env.photos.some(photo => photo.innerHTML.includes('<img')));
  const coffee = env.select('coffee'); assert(coffee.card.classes.has('is-selected')); assert.match(coffee.state.textContent, /Selecionado/);
  env.nodes['.tp-picker-next'].onclick(); await tick();
  env.select('banana'); assert.match(env.nodes['.tp-picker-count'].textContent, /2 selecionado/);
  env.nodes['.tp-picker-prev'].onclick(); await tick();
  assert(env.checks().find(input => input.dataset.productCheck === 'coffee').checked);
  await env.nodes['.tp-picker-add'].onclick();
  assert.deepEqual(calls, [['coffee', 'banana']]); assert.deepEqual(pages, [1, 2, 1]);
  assert.equal(previews.length, 3); assert(!env.dialog.isConnected);
});

test('page selection only adds available products and failed saves retain the complete selection for retry', async t => {
  const env = fixture(t), calls = []; let fail = true, resolve;
  openPromotionProductPicker(env.root, {
    selectedIds: ['existing'], loadPage: async () => ({ page: 1, total: 3,
      items: [{ id: 'existing', name: 'Já adicionado' }, { id: 'p1', name: 'Arroz' }, { id: 'p2', name: 'Feijão' }] }),
    loadPreviews: async () => {},
    onAdd: ids => { calls.push(ids); return new Promise((done, reject) => { resolve = () => fail ? reject(Error('Versão antiga.')) : done({ id: 'saved' }); }); },
  });
  await tick();
  env.nodes['.tp-picker-page-check'].onchange({ target: { checked: true } });
  assert.match(env.nodes['.tp-picker-count'].textContent, /2 selecionado/);
  const request = env.nodes['.tp-picker-add'].onclick();
  await env.nodes['.tp-picker-add'].onclick();
  assert.equal(calls.length, 1); assert(env.nodes['.tp-picker-search'].disabled);
  const escape = new Event('cancel', { cancelable: true }); env.dialog.dispatchEvent(escape); assert(escape.defaultPrevented);
  resolve(); await request;
  assert(env.dialog.open); assert.match(env.nodes['.tp-status'].textContent, /Versão antiga/);
  assert(env.checks().filter(input => input.checked).length === 2);
  fail = false; const retry = env.nodes['.tp-picker-add'].onclick(); resolve(); await retry;
  assert.deepEqual(calls, [['p1', 'p2'], ['p1', 'p2']]); assert(!env.dialog.isConnected);
});

test('late catalog responses and previews cannot change a closed picker or another company', async t => {
  const env = fixture(t); let current = true, completePage, preview;
  openPromotionProductPicker(env.root, {
    isCurrent: () => current,
    loadPage: () => new Promise(resolve => { completePage = resolve; }),
    loadPreviews: async (_rows, options) => { preview = options; }, onAdd: async () => {},
  });
  current = false; completePage({ page: 1, total: 1, items: [{ id: 'old', name: 'Outra empresa' }] }); await tick();
  assert.equal(env.nodes['.tp-picker-grid'].innerHTML, ''); assert.equal(preview, undefined);
  env.dialog.close(); current = true;
  openPromotionProductPicker(env.root, {
    loadPage: async () => ({ page: 1, total: 1, items: [{ id: 'photo', name: 'Foto' }] }),
    loadPreviews: async (_rows, options) => { preview = options; }, onAdd: async () => {},
  });
  await tick(); env.dialog.close();
  assert.equal(preview.isCurrent(), false);
  const before = env.photos[0].innerHTML; preview.onBatch([{ id: 'photo', name: 'Foto', photo: png }]);
  assert.equal(env.photos[0].innerHTML, before);
});
