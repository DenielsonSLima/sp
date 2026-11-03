import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshOfferMatrix } from '../interno/cotacao/price-matrix-refresh.js';

const markupNode = () => ({
  value: '', writes: 0, outerValue: '', outerWrites: 0,
  get innerHTML() { return this.value; },
  set innerHTML(value) { this.value = value; this.writes++; },
  get outerHTML() { return this.outerValue; },
  set outerHTML(value) { this.outerValue = value; this.outerWrites++; },
});

function fixture() {
  const q = {
    items: [{ id: 'a', name: 'Arroz' }, { id: 'b', name: 'Feijão' }],
    providers: [{ id: 'p', name: 'Fornecedor' }, { id: 's', name: 'Segundo' }],
    offers: { a: { p: 100, s: 200 }, b: { p: 200, s: 300 } }, awards: { a: 'p' },
    computed: {
      comparisons: { a: { lowest: ['p'] }, b: { lowest: ['p'] } },
      lineTotals: { a: { p: 100, s: 200 }, b: { p: 200, s: 300 } },
      totals: [{ id: 'p', subtotal: 300, complete: true }, { id: 's', subtotal: 500, complete: true }],
      awardedByProvider: [{ id: 'p', total: 100, items: [{ id: 'a' }] }, { id: 's', total: 0, items: [] }],
      selectedTotal: 100,
    },
  };
  const forms = q.items.flatMap(({ id: item }) => q.providers.map(({ id: provider }) => {
    const nodes = Object.fromEntries(['.offer-badges', '.offer-history', '.offer-total', '.offer-draft-note']
      .map((selector) => [selector, markupNode()]));
    const cell = { querySelector: (selector) => nodes[selector], classList: { toggle() {} } };
    const form = { dataset: { item, provider }, elements: { price: { disabled: false } }, closest: () => cell };
    const choose = { dataset: { item, provider }, disabled: false, setAttribute() {}, closest: () => cell };
    nodes['.offer-form'] = form;
    nodes['.choose-offer'] = choose;
    return form;
  }));
  const footer = markupNode(), approved = markupNode();
  const matrix = {
    dataset: {}, querySelector: () => footer,
    querySelectorAll(selector) {
      if (selector === '.offer-form') return forms;
      if (selector === '.choose-offer') return forms.map((form) => form.closest().querySelector('.choose-offer'));
      const item = selector.match(/data-item="([^"]+)"/)[1];
      return forms.filter((form) => form.dataset.item === item);
    },
  };
  const root = { querySelector: (selector) => selector === '.quote-price-matrix' ? matrix : approved };
  const writes = (item, selector) => forms.filter((form) => form.dataset.item === item)
    .map((form) => form.closest().querySelector(selector).writes);
  return { q, root, forms, footer, approved, writes };
}

test('draft price updates only its product row and never rewrites totals before RPC', () => {
  const { q, root, forms, footer, approved, writes } = fixture();
  refreshOfferMatrix(root, q, { itemId: 'a', drafts: new Map([['a|p', '1,50']]), blocked: true, amounts: false });
  assert.deepEqual(writes('a', '.offer-badges'), [1, 1]);
  assert.deepEqual(writes('b', '.offer-badges'), [0, 0]);
  assert.deepEqual(writes('b', '.offer-history'), [0, 0]);
  assert.deepEqual(writes('a', '.offer-total'), [0, 0]);
  assert.equal(footer.writes, 0);
  assert.equal(approved.outerWrites, 0);
  assert.ok(forms.every((form) => form.closest().querySelector('.choose-offer').disabled));
});

test('RPC acknowledgement updates affected totals, preserves other cells and avoids identical writes', () => {
  const { q, root, forms, footer, approved, writes } = fixture();
  const options = { itemId: 'a', drafts: new Map(), blocked: false };
  q.offers.a.p = 150;
  q.computed.lineTotals.a.p = 150;
  q.computed.totals[0].subtotal = 350;
  q.computed.selectedTotal = 150;
  refreshOfferMatrix(root, q, options);
  assert.deepEqual(writes('a', '.offer-total'), [1, 1]);
  assert.deepEqual(writes('b', '.offer-total'), [0, 0]);
  assert.deepEqual(writes('b', '.offer-badges'), [0, 0]);
  assert.equal(footer.writes, 1);
  assert.equal(approved.outerWrites, 1);
  assert.ok(forms.every((form) => !form.closest().querySelector('.choose-offer').disabled));
  refreshOfferMatrix(root, q, options);
  assert.deepEqual(writes('a', '.offer-total'), [1, 1]);
  assert.equal(footer.writes, 1);
  assert.equal(approved.outerWrites, 1);
});
