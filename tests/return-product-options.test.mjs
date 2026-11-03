import test from 'node:test';
import assert from 'node:assert/strict';
import { productChoices } from '../interno/devolucoes-fornecedores/product-options.js';

const products = Array.from({ length: 100 }, (_, index) => ({ id: `p${index}`, name: `Produto ${index}`, unit: 'UN' }));
products[70] = { id: 'p70', name: 'Café tradicional', unit: 'KG' };

test('return product selector limits mounted choices and retains a selected product outside the result window', () => {
  assert.equal(productChoices(products).visible.length, 30);
  const chosen = productChoices(products, '', 'p70');
  assert.equal(chosen.visible.length, 31);
  assert.equal(chosen.visible[0].id, 'p70');
  assert.equal(chosen.total, 100);
});

test('return product search reaches products beyond the first page and ignores accents and case', () => {
  assert.deepEqual(productChoices(products, 'CAFE').visible.map((item) => item.id), ['p70']);
  const retained = productChoices(products, 'missing', 'p70');
  assert.equal(retained.total, 0);
  assert.equal(retained.visible[0].id, 'p70');
  assert.equal(productChoices(products, 'missing').visible.length, 0);
});
