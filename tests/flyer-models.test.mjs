import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FLYER_MODEL_PRESETS, createBlankFlyerModel, validateFlyerModel, duplicateFlyerModel,
  isFlyerModel, modelSlotCount,
} from '../interno/encartes/modelos/model.js';
import { generateFlyerPages, FLYER_FORMATS, FLYER_TEMPLATES } from '../interno/encartes/generator/index.js';
import { validateDesign } from '../interno/encartes/model.js';
import { wrapText } from '../interno/encartes/renderer.js';

const photo = 'data:image/png;base64,aGVsbG8=';
const campaign = (count) => ({
  id: 'offers-1', name: 'Promoção de verão', start: '2026-11-03', end: '2026-11-10',
  items: Array.from({ length: count }, (_, i) => ({
    id: `offer-${i}`, productId: `product-${i}`, name: `Produto ${i}`, cents: 299 + i, unit: i % 2 ? 'kg' : 'unid',
  })),
});

test('seasonal models are blank editable documents with complete spaces and no offer values', () => {
  const backgrounds = new Set();
  for (const preset of FLYER_MODEL_PRESETS) for (const format of FLYER_FORMATS) for (const grid of FLYER_TEMPLATES) {
    const model = createBlankFlyerModel({ presetId: preset.id, formatId: format.id, templateId: grid.id });
    assert(isFlyerModel(model));
    assert(isFlyerModel(model.id));
    assert.equal(model.status, 'created');
    assert.equal(model.title, preset.name);
    assert.equal(model.width, format.width);
    assert.equal(model.height, format.height);
    assert.equal(modelSlotCount(model), grid.perPage);
    assert.deepEqual(validateDesign(model), model);
    assert.equal(model.publication, undefined);
    assert(model.elements.filter(e => /^slot-\d+-foto$/.test(e.id)).every(e => e.src === '' && !e.locked));
    assert(model.elements.every(e => !e.offerProductId));
    assert(model.elements.filter(e => /^slot-\d+-preco$/.test(e.id)).every(e => e.text === 'Preço'));
    backgrounds.add(model.bgColor);
  }
  assert.equal(backgrounds.size, FLYER_MODEL_PRESETS.length);
});

test('filling an edited model keeps geometry, image fit, typography, and decorative artwork', () => {
  const model = createBlankFlyerModel({ presetId: 'natal', templateId: 'grid-6' }), source = campaign(7);
  const image = model.elements.find(e => e.id === 'slot-1-foto');
  Object.assign(image, { x: image.x + 9, width: image.width - 18, height: image.height + 5, rotation: 3, fit: 'cover' });
  const name = model.elements.find(e => e.id === 'slot-1-nome');
  Object.assign(name, { fontSize: 19, color: '#123456', align: 'left', fontFamily: 'Georgia', rotation: -2 });
  const price = model.elements.find(e => e.id === 'slot-1-preco');
  Object.assign(price, { fontSize: 31, color: '#654321' });
  model.elements.find(e => e.id === 'nome-da-promocao').fontSize = 33;
  model.guides = { x: [50, 400], y: [200] };
  const before = structuredClone(model), sourceBefore = structuredClone(source);
  source.items[0].displayName = 'Açúcar cristal\nPacote econômico';
  sourceBefore.items[0].displayName = source.items[0].displayName;
  const photos = new Map(source.items.map(item => [item.productId, photo]));
  const pages = generateFlyerPages(source, { model, photos });
  assert.equal(pages.length, 2);
  assert.deepEqual(model, before);
  assert.deepEqual(source, sourceBefore);
  assert.equal(pages[0].width, model.width);
  assert.equal(pages[0].height, model.height);
  assert.deepEqual(pages[0].guides, model.guides);
  assert(!isFlyerModel(pages[0]));
  assert.notEqual(pages[0].id, pages[1].id);
  for (const [index, page] of pages.entries()) {
    const filledImage = page.elements.find(e => e.id === image.id);
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'fit']) assert.equal(filledImage[key], image[key]);
    assert.equal(filledImage.src, photo);
    const filledName = page.elements.find(e => e.id === name.id);
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'fontSize', 'fontFamily', 'color', 'align'])
      assert.equal(filledName[key], name[key]);
    assert.equal(filledName.text, source.items[index * 6].displayName || source.items[index * 6].name);
    assert.equal(page.elements.find(e => e.id === price.id).fontSize, 31);
    assert.equal(page.elements.find(e => e.id === 'nome-da-promocao').text, source.name);
    assert.equal(page.elements.find(e => e.id === 'nome-da-promocao').fontSize, 33);
    assert.equal(page.elements.find(e => e.id === 'numero-da-pagina').text, `${index + 1} / 2`);
    assert.deepEqual(page.elements.find(e => e.id === 'natal-bola-1'), model.elements.find(e => e.id === 'natal-bola-1'));
  }
  assert.equal(pages[1].elements.filter(e => /^slot-/.test(e.id)).length, 6);
  assert(!pages[1].elements.some(e => /^slot-[2-9]-/.test(e.id)));
  const savedIds = pages.flatMap(page => page.elements.filter(e => e.offerField === 'name').map(e => e.offerProductId));
  assert.deepEqual(savedIds, source.items.map(item => item.productId));
});

test('custom templates preserve saved offer values and use explicit missing-photo placeholders', () => {
  const model = createBlankFlyerModel(), source = campaign(2);
  source.items[0].cents = 123456;
  const [page] = generateFlyerPages(source, { model, photos: { 'product-0': photo } });
  assert.equal(page.elements.find(e => e.id === 'slot-1-preco').text, 'R$ 1.234,56');
  assert.equal(page.elements.find(e => e.id === 'slot-2-unidade').text, 'por kg');
  assert.equal(page.elements.find(e => e.id === 'slot-2-foto').text, 'Imagem não cadastrada');
  assert.equal(page.elements.find(e => e.id === 'validade-da-promocao').text,
    'Ofertas válidas de 03/11/2026 a 10/11/2026');
});

test('duplicating a model creates a separate durable document and retains editable slots', () => {
  const source = createBlankFlyerModel({ title: 'Meu Natal' });
  source._version = 8;
  const duplicate = duplicateFlyerModel(source);
  assert.notEqual(duplicate.id, source.id);
  assert.equal(duplicate.title, 'Meu Natal (cópia)');
  assert.equal(duplicate.status, 'created');
  assert.equal(duplicate._version, undefined);
  assert.equal(modelSlotCount(duplicate), 8);
  duplicate.elements[0].fill = '#ffffff';
  assert.notEqual(duplicate.elements[0].fill, source.elements[0].fill);
});

test('broken model slots fail clearly before generating or saving', () => {
  const base = createBlankFlyerModel();
  assert.throws(() => validateFlyerModel({ ...base, id: 'ordinary-art' }), /modelo de encarte/);
  assert.throws(() => validateFlyerModel({ ...base, elements: [] }), /espaços de produtos/);
  const withoutPrice = { ...base, elements: base.elements.filter(e => e.id !== 'slot-1-preco') };
  assert.throws(() => generateFlyerPages(campaign(1), { model: withoutPrice }), /espaço 1 precisa/);
  assert.throws(() => validateFlyerModel({ ...base, elements: [...base.elements, base.elements.find(e => e.id === 'slot-1-foto')] }), /repetidos/);
  assert.throws(() => createBlankFlyerModel({ presetId: 'unknown' }), /modelo disponível/);
  assert.throws(() => generateFlyerPages(campaign(1), { model: base, photos: { 'product-0': 'https://invalid.test/photo' } }), /Imagem inválida/);
});

test('the default proportions prioritize photos over names in every grid', () => {
  for (const grid of FLYER_TEMPLATES) {
    const model = createBlankFlyerModel({ templateId: grid.id });
    const image = model.elements.find(e => e.id === 'slot-1-foto');
    const name = model.elements.find(e => e.id === 'slot-1-nome');
    const card = model.elements.find(e => e.id === 'slot-1-cartao');
    assert(image.height > card.height * .55);
    assert(image.height > name.height * 4);
    assert(name.fontSize <= 27);
  }
});

test('new models default to Stories with eight predefined product spaces', () => {
  const model = createBlankFlyerModel();
  assert.equal(model.width, 1080);
  assert.equal(model.height, 1920);
  assert.equal(modelSlotCount(model), 8);
  const grid = FLYER_TEMPLATES.find(row => row.id === 'grid-8');
  assert.equal(grid.columns, 2);
  assert.equal(grid.perPage, 8);
  const source = campaign(17), pages = generateFlyerPages(source, { model });
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map(page => page.elements.filter(e => e.offerField === 'name').length), [8, 8, 1]);
});

test('three festive layouts use different artwork and fixed name, photo and price ordering', () => {
  const assets = new Set();
  for (const presetId of ['natal-ceia', 'natal-presentes', 'natal-semana']) {
    const model = createBlankFlyerModel({ presetId });
    const find = field => model.elements.find(e => e.id === `slot-1-${field}`);
    const name = find('nome'), image = find('foto'), price = find('preco'), badge = find('selo-preco');
    assert.equal(modelSlotCount(model), 8);
    assert.equal(model.elements.find(e => e.id === 'arte-do-modelo').height, 480);
    assets.add(model.elements.find(e => e.id === 'arte-do-modelo').src);
    assert(name.autoFit && price.autoFit);
    assert(image.height > name.height * 3.5);
    assert(price.x >= badge.x && price.x + price.width <= badge.x + badge.width);
    assert(price.y >= badge.y && price.y + price.height <= badge.y + badge.height);
    if (presetId === 'natal-ceia') assert(image.y < name.y && name.y < price.y);
    if (presetId === 'natal-presentes') {
      assert(image.y < price.y && price.y < name.y);
      assert.equal(price.color, '#ffffff');
      assert.equal(badge.fill, '#c6202e');
      assert.equal(badge.radius, badge.height / 2);
    }
    if (presetId === 'natal-semana') {
      assert(name.y < image.y && image.y < price.y);
      assert.equal(badge.fill, '#f5cf72');
    }
    const source = campaign(9);
    source.items[0].displayName = 'Produto com nome extenso e informações da embalagem '.repeat(5);
    source.items[0].cents = 123456789;
    const pages = generateFlyerPages(source, { model });
    assert.equal(pages.length, 2);
    assert.equal(pages[0].elements.find(e => e.id === name.id).text, source.items[0].displayName);
    assert.equal(pages[0].elements.find(e => e.id === price.id).text, 'R$ 1.234.567,89');
    assert.equal(pages[1].elements.filter(e => /^slot-/.test(e.id)).length, 7);
    assert(!pages[1].elements.some(e => /^slot-[2-9]-/.test(e.id)));
  }
  assert.equal(assets.size, 3);
});

test('automatic name wrapping preserves accents, explicit lines and very long words', () => {
  const ctx = { measureText: text => ({ width: Array.from(text).length * 6 }) };
  const compound = 'LEITEINTEGRALSEMLACTOSE'.repeat(12);
  const lines = wrapText(ctx, compound, 300);
  assert(lines.length > 1);
  assert.equal(lines.join(''), compound);
  assert(lines.every(line => ctx.measureText(line).width <= 300));
  assert.deepEqual(wrapText(ctx, 'AÇÚCAR CRISTAL\n1 KG', 300), ['AÇÚCAR CRISTAL', '1 KG']);
});
