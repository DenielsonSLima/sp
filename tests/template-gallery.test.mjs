import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createDesign } from '../interno/encartes/model.js';
import { applyTemplate, templates } from './fixtures/legacy-operations/flyer-templates.js';
import { renderDesign } from '../interno/encartes/renderer.js';
const require = createRequire(import.meta.url);
let native;
try {
  native = require('@napi-rs/canvas');
} catch {}
for (const count of [1, 3, 6, 9])
  test(
    `original template ${count} renders a real portrait preview and complete product layout`,
    { skip: !native },
    async () => {
      const template = templates.find((t) => t.productCount === count);
      assert(template);
      const d = applyTemplate(createDesign({ width: 1080, height: 1350 }), template.id);
      assert.equal(d.elements.filter((e) => e.type === 'product').length, count);
      const canvas = native.createCanvas(1, 1);
      await renderDesign(canvas, d, { scale: 1 / 3 });
      assert.equal(canvas.width, 360);
      assert.equal(canvas.height, 450);
      assert(canvas.toBuffer('image/png').length > 3000);
      for (const e of d.elements) assert(e.x + e.width <= 1080.001 && e.y + e.height <= 1350.001);
    },
  );
test('Galeria is initial destination and legacy template previews retain actual design renderer', async () => {
  const state = await readFile(new URL('../interno/encartes/editor-state.js', import.meta.url), 'utf8');
  assert.match(state, /tab:\s*'gallery'/);
  const gallery = (await readFile(new URL('../interno/encartes/template-gallery.js', import.meta.url), 'utf8')).replace(
    /\s+/g,
    '',
  );
  assert(gallery.includes('renderDesign'));
  assert(gallery.includes('awaitprepareTemplateDesign(fresh(),id,catalog'));
  assert(gallery.includes('await(id?onChoose(design):onBlank(design))'));
  assert(!gallery.includes('instagram'));
});

import { templateDesign } from './fixtures/legacy-operations/flyer-template-gallery.js';
test('new template selection uses actual category products without copying illustrative preview prices', () => {
  const photo = 'data:image/png;base64,aGVsbG8=';
  const catalog = [
    { id: 'cookie', name: 'Biscoito Vitarella', category: 'Mercearia', unit: 'UN', photo },
    { id: 'milk', name: 'Leite Piracanjuba', category: 'Laticínios', unit: 'UN', photo },
  ];
  const design = templateDesign(createDesign(), 'oferta-relampago', catalog),
    product = design.elements.find((e) => e.type === 'product');
  assert.equal(product.name, 'Leite Piracanjuba');
  assert.equal(product.photo, undefined);
  assert.equal(product.image, photo);
  assert.equal(product.placeholder, false);
  assert.equal(product.priceText, '');
  assert.equal(product.priceCents, undefined);
  assert.equal(design.elements.find((e) => e.linkedField === 'price').text, 'R$ —,—');
});
