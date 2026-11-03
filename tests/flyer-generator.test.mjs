import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFlyerPages, campaignValidityLabel, FLYER_FORMATS, FLYER_TEMPLATES, FLYER_THEMES }
  from '../interno/encartes/generator/index.js';
import { validateDesign } from '../interno/encartes/model.js';

const photo = 'data:image/png;base64,aGVsbG8=';
const campaign = (count) => ({
  id: 'campaign-1', name: 'Ofertas da semana', start: '2026-11-03', end: '2026-11-09',
  items: Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`, productId: `sku-${index}`, name: `Produto ${index}`,
    cents: 1234 + index, unit: index % 2 ? 'kg' : 'unid',
  })),
});
const names = (pages) => pages.flatMap((page) => page.elements.filter((e) => e.offerField === 'name'));

test('flyer pagination includes every campaign item exactly once, including the final incomplete page', () => {
  const source = campaign(14), before = structuredClone(source);
  for (const template of FLYER_TEMPLATES) {
    const pages = generateFlyerPages(source, { templateId: template.id });
    assert.equal(pages.length, Math.ceil(source.items.length / template.perPage));
    assert.deepEqual(names(pages).map((e) => e.offerProductId), source.items.map((item) => item.productId));
    assert.equal(new Set(pages.map((page) => page.id)).size, pages.length);
    assert.equal(names([pages.at(-1)]).length, source.items.length % template.perPage);
  }
  assert.deepEqual(source, before, 'the saved campaign must not be changed by composition');
});

test('flyers preserve saved promotional prices, units, display names and validity', () => {
  const source = campaign(2);
  source.items[0].displayName = 'Açúcar cristal\nSeleção São João';
  source.items[0].cents = 100001;
  const [page] = generateFlyerPages(source);
  assert.equal(page.elements.find((e) => e.offerField === 'name').text, source.items[0].displayName);
  assert.deepEqual(page.elements.filter((e) => e.offerField === 'price').map((e) => e.text), ['R$ 1.000,01', 'R$ 12,35']);
  assert.deepEqual(page.elements.filter((e) => e.offerField === 'unit').map((e) => e.text), ['por unid', 'por kg']);
  assert.equal(page.elements.find((e) => e.id === 'validade-da-promocao').text,
    'Ofertas válidas de 03/11/2026 a 09/11/2026');
  assert.equal(campaignValidityLabel({ omitValidity: true }), '');
  assert.equal(campaignValidityLabel({ start: '2026-11-03', end: '2026-11-03' }), 'Ofertas válidas em 03/11/2026');
});

test('every format and theme produces bounded editable elements with contained product images', () => {
  const source = campaign(12), photos = Object.fromEntries(source.items.map((item) => [item.productId, photo]));
  for (const format of FLYER_FORMATS) for (const theme of FLYER_THEMES) {
    const [page] = generateFlyerPages(source, { templateId: 'grid-12', formatId: format.id, themeId: theme.id, photos });
    assert.deepEqual(validateDesign(page), page);
    assert.equal(page.width, format.width);
    assert.equal(page.height, format.height);
    const images = page.elements.filter((e) => e.type === 'image' && e.id !== 'marca-da-loja');
    assert.equal(images.length, 12);
    assert(images.every((e) => e.src === photo && e.fit === 'contain' && !e.locked));
    assert(names([page]).every((e) => e.autoFit));
    for (const element of page.elements) {
      assert(element.x >= 0 && element.y >= 0);
      assert(element.x + element.width <= page.width + 1e-8);
      assert(element.y + element.height <= page.height + 1e-8);
    }
  }
});

test('final pages have no filler offers and missing photos remain explicit', () => {
  const source = campaign(7);
  const pages = generateFlyerPages(source, { photos: new Map([['sku-0', photo]]), logo: '' });
  assert.equal(pages[0].elements.filter((e) => e.type === 'image').length, 1);
  assert.equal(pages[0].elements.filter((e) => e.text === 'Imagem não cadastrada').length, 5);
  assert.equal(names([pages[1]]).length, 1);
  assert.equal(pages[1].elements.find((e) => e.id === 'numero-da-pagina').text, '2 / 2');
});

test('long promotional names keep full text and receive more vertical room', () => {
  const source = campaign(12);
  source.items[0].displayName = 'Produto com uma descrição promocional detalhada '.repeat(6);
  const [page] = generateFlyerPages(source, { templateId: 'grid-12' });
  const description = names([page]);
  assert.equal(description[0].text, source.items[0].displayName);
  assert(description[0].height > description[1].height);
  assert(description[0].autoFit);
});

test('invalid choices, invalid images and incomplete campaign values fail instead of inventing offer data', () => {
  assert.throws(() => generateFlyerPages(campaign(0)), /promoção salva com produtos/);
  assert.throws(() => generateFlyerPages(campaign(1), { templateId: 'missing' }), /modelo disponível/);
  assert.throws(() => generateFlyerPages(campaign(1), { themeId: 'missing' }), /tema disponível/);
  assert.throws(() => generateFlyerPages(campaign(1), { formatId: 'missing' }), /formato disponível/);
  assert.throws(() => generateFlyerPages(campaign(1), { photos: { 'sku-0': 'https://example.test/photo.png' } }), /Imagem inválida/);
  for (const cents of [null, undefined, NaN, -1, 0, 1.5]) {
    const source = campaign(1);
    source.items[0].cents = cents;
    assert.throws(() => generateFlyerPages(source), /preço.*não está disponível/);
  }
  assert.throws(() => generateFlyerPages({ ...campaign(1), start: '2026-02-31' }), /validade.*inválida/);
});

test('saved page titles preserve their page suffix even for a long campaign name', () => {
  const source = campaign(7);
  source.name = 'Ofertas especiais de aniversário '.repeat(5);
  const pages = generateFlyerPages(source);
  assert.match(pages[0].title, / · Página 1 de 2$/);
  assert.match(pages[1].title, / · Página 2 de 2$/);
  assert.equal(pages[0].elements.find((e) => e.id === 'nome-da-promocao').text, source.name);
});
