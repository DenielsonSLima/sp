import test from 'node:test';
import assert from 'node:assert/strict';
import { productRoute, productHref, changeProductList } from '../interno/cadastros/produtos/navigation.js';
import { sortedOptions, subcategoryOptions } from '../interno/cadastros/produtos/list-filters.js';

test('multiple filters survive navigation, commas and accents without resetting an equivalent page', () => {
  const state = { category: ['Bebidas', 'Mercearia, grãos'], subcategory: ['a', 'b'], query: 'café', view: 'table', page: 3 };
  assert.deepEqual(productRoute(productHref('p1', state)), { id: 'p1', ...state });
  assert.equal(changeProductList(state, { category: ['Mercearia, grãos', 'Bebidas', 'Bebidas'] }).page, 3);
  assert.equal(changeProductList(state, { subcategory: ['b'] }).page, 1);
  assert.equal(changeProductList(state, { category: [], subcategory: [] }).category, '');
});

test('options use Portuguese alphabetical order and include subcategories from every selected parent', () => {
  const categories = [{ id: 'a', name: 'Mercearia' }, { id: 'b', name: 'Bebidas' }, { id: 'c', name: 'Outros' }];
  const subs = [{ id: 'z', name: 'Sucos', parentId: 'b' }, { id: 'x', name: 'Açúcares', parentId: 'a' }, { id: 'y', name: 'Outros', parentId: 'c' }];
  assert.deepEqual(subcategoryOptions(categories, subs, ['Bebidas', 'Mercearia']).map(o => o.value), ['x', 'z']);
  assert.equal(subcategoryOptions(categories, subs, []).length, 3);
  const rows = ['Mercearia', 'Bebidas', 'Açougue', 'Água'].map(label => ({ label }));
  assert.deepEqual(sortedOptions(rows).map(o => o.label), ['Açougue', 'Água', 'Bebidas', 'Mercearia']);
  assert.equal(rows[0].label, 'Mercearia');
});
