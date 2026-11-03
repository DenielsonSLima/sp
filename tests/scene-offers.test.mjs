import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, validateDesign } from '../interno/encartes/model.js';
import { createSceneOfferElements } from '../interno/encartes/gallery/scene-offers.js';
import { offerTextInput, readOfferText } from '../interno/encartes/editor/offer-fields.js';

const scene = () => createDesign({ width: 1080, height: 1920 });
const price = (product) => createSceneOfferElements(scene(), [{ id: 'catalog-item', name: 'Produto 500 g', unit: 'UN', ...product }])
  .find(element => element.offerField === 'price').text;

test('scene offers do not turn unknown or invalid prices into fictitious numeric offers', () => {
  for (const product of [{}, { priceCents: -1 }, { priceCents: NaN }, { priceCents: 12.5 }, { priceCents: '1299' }, { priceText: '   ' }]) {
    assert.equal(price(product), 'R$ —,—');
  }
  assert.equal(price({ priceCents: 0 }), 'R$ 0,00');
  assert.equal(price({ priceCents: 1299 }), 'R$ 12,99');
  assert.equal(price({ priceText: '8,90' }), 'R$ 8,90');
  assert.equal(price({ priceText: 'R$ 8,90', priceCents: 1299 }), 'R$ 8,90');
});

test('scene offers reject missing product identity and out-of-scope product counts', () => {
  for (const products of [[], null, Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, name: 'Produto' }))]) {
    assert.throws(() => createSceneOfferElements(scene(), products), /um a quatro/);
  }
  for (const product of [null, {}, { id: 'p', name: '' }, { id: 'p', name: '   ' }, { name: 'Sem identidade' }]) {
    assert.throws(() => createSceneOfferElements(scene(), [product]), /identificados/);
  }
});

test('offer labels and drafts stay editable without mutating catalog records or requiring product photos', () => {
  const design = scene();
  const products = [{ id: 'p1', name: 'Carne bovina', unit: 'KG', priceCents: 2999, photo: 'https://not-needed.invalid/photo' }, { id: 'p2', name: 'Leite 1 L', unit: 'UN' }];
  const before = structuredClone(products);
  design.elements = createSceneOfferElements(design, products);
  const restored = validateDesign(JSON.parse(JSON.stringify(design)));
  const fields = restored.elements.filter(element => element.offerField);
  assert.equal(fields.length, 4);
  assert(fields.every(element => element.type === 'text' && !element.locked && !element.hidden));
  assert.deepEqual(fields.filter(element => element.offerField === 'price').map(element => element.priceBadge.unit), ['por kg', 'cada']);
  assert(restored.elements.every(element => ['text', 'shape'].includes(element.type)));
  assert(!JSON.stringify(restored).includes('not-needed.invalid'));
  fields.find(element => element.offerField === 'price').text = 'R$ 25,90';
  fields.find(element => element.offerField === 'name').text = 'Nome editado para esta oferta';
  assert.deepEqual(products, before);
});

test('price editing starts blank for an unknown offer and clearing the field never creates a zero price', () => {
  const element = { type: 'text', offerField: 'price', text: 'R$ —,—' };
  assert.match(offerTextInput(element), /value=""/);
  assert.equal(readOfferText(element, ' 12,90 '), 'R$ 12,90');
  assert.equal(readOfferText(element, 'R$ 12,90'), 'R$ 12,90');
  assert.equal(readOfferText(element, ''), 'R$ —,—');
  assert.equal(readOfferText(element, '   '), 'R$ —,—');
  assert.equal(readOfferText(element, 'R$'), 'R$ —,—');
  assert.equal(readOfferText(element, null), 'R$ —,—');
  assert.match(offerTextInput({ ...element, text: 'R$ 12,90' }), /value="12,90"/);
  assert.equal(readOfferText({ offerField: 'name' }, 'Descrição livre'), 'Descrição livre');
  assert(!offerTextInput({ offerField: 'name', text: '</textarea><script>bad()</script>' }).includes('<script>'));
  assert.match(offerTextInput({ ...element, text: 'R$ " onfocus="bad()' }), /value="&quot; onfocus=&quot;bad\(\)"/);
});

test('offer identity survives document validation only with a valid catalog ID and supported field', () => {
  const design = scene();
  const element = createSceneOfferElements(design, [{ id: 'catalog-item_1', name: 'Produto' }])
    .find(item => item.offerField === 'name');
  for (const offerField of ['name', 'price', 'unit']) {
    const [restored] = validateDesign({ ...design, elements: [{ ...element, offerField }] }).elements;
    assert.equal(restored.offerProductId, 'catalog-item_1');
    assert.equal(restored.offerField, offerField);
  }
  for (const metadata of [
    { offerProductId: '' }, { offerProductId: '<script>' }, { offerProductId: 42 },
    { offerProductId: 'x'.repeat(101) }, { offerField: 'unknown' }, { offerField: undefined },
  ]) {
    const [restored] = validateDesign({ ...design, elements: [{ ...element, ...metadata }] }).elements;
    assert(!Object.hasOwn(restored, 'offerProductId'));
    assert(!Object.hasOwn(restored, 'offerField'));
    assert.equal(restored.text, element.text);
  }
});

test('numeric offer input completes two decimals without turning an empty price into zero', () => {
  const field = { offerField: 'price' };
  for (const [input, expected] of [
    ['12', 'R$ 12,00'], ['12,9', 'R$ 12,90'], ['12.9', 'R$ 12,90'],
    ['12,', 'R$ 12,00'], ['0', 'R$ 0,00'], [',5', 'R$ 0,50'],
    ['R$ 12', 'R$ 12,00'], ['1.234,5', 'R$ 1234,50'], ['1.234', 'R$ 1234,00'],
    ['', 'R$ —,—'], ['sob consulta', 'R$ sob consulta'],
  ]) assert.equal(readOfferText(field, input), expected);
});
