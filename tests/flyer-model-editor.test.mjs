import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign } from '../interno/encartes/model.js';
import { openDesign, commitDesign, editorState } from '../interno/encartes/editor-state.js';
import { quickAdjustment } from '../interno/encartes/editor/quick-adjustments.js';
import { isAutomaticModelField } from '../interno/encartes/editor/template-fields.js';
import { renderDesign, fitTextLayout } from '../interno/encartes/renderer.js';
import { studioMarkup } from '../interno/encartes/views/studio.js';
import { prepareEditorDesign } from '../interno/encartes/editor/open-design.js';
import { createModelJsonBlob } from '../interno/encartes/editor/template-export.js';
import { createBlankFlyerModel, validateFlyerModel } from '../interno/encartes/modelos/model.js';

test('model edits and undo keep their permanent library identity and status', () => {
  const design = { ...createDesign(), id: 'modelo_sample', status: 'created' };
  openDesign(design);
  commitDesign({ ...design, title: 'Natal personalizado' });
  assert.equal(editorState.design.id, 'modelo_sample');
  assert.equal(editorState.design.status, 'created');
  assert.equal(editorState.history.undo().status, 'created');
  const artwork = { ...design, id: 'ordinary-artwork' };
  openDesign(artwork);
  commitDesign({ ...artwork, title: 'Arte revisada' });
  assert.equal(editorState.design.status, 'draft');
});

test('enlarging a photo preserves its aspect ratio, center, id and slot binding', () => {
  const photo = { id: 'slot-1-foto', type: 'image', x: 100, y: 150, width: 200, height: 300 };
  const patch = quickAdjustment(photo, 'image-larger', { width: 1080, height: 1350 });
  assert.ok(Math.abs(patch.width / patch.height - photo.width / photo.height) < 0.00001);
  assert.equal(patch.x + patch.width / 2, photo.x + photo.width / 2);
  assert.equal(patch.y + patch.height / 2, photo.y + photo.height / 2);
  assert.equal({ ...photo, ...patch }.id, 'slot-1-foto');
  assert.equal(photo.width, 200);
});

test('photo adjustments stay inside canvas and locked fields are unchanged', () => {
  const photo = { type: 'image', x: 0, y: 0, width: 1000, height: 500 };
  const patch = quickAdjustment(photo, 'image-larger', { width: 1000, height: 1000 });
  assert.deepEqual(patch, { width: 1000, height: 500, x: 0, y: 0 });
  assert.equal(quickAdjustment({ ...photo, locked: true }, 'image-smaller', {}), null);
});

test('font adjustments affect only the selected text and respect font bounds', () => {
  const label = { id: 'slot-2-nome', type: 'text', fontSize: 24 };
  assert.deepEqual(quickAdjustment(label, 'font-smaller', {}), { fontSize: 22 });
  assert.deepEqual(quickAdjustment({ ...label, fontSize: 8 }, 'font-smaller', {}), { fontSize: 8 });
  assert.deepEqual(quickAdjustment({ ...label, fontSize: 599 }, 'font-larger', {}), { fontSize: 600 });
  assert.equal(quickAdjustment({ ...label, priceBadge: {} }, 'font-larger', {}), null);
  assert.equal(label.fontSize, 24);
});

test('automatic model fields are protected without locking their geometry', () => {
  const model = { id: 'modelo_sample' };
  for (const field of ['foto', 'nome', 'preco', 'unidade'])
    assert.equal(isAutomaticModelField(model, { id: `slot-1-${field}` }), true);
  assert.equal(isAutomaticModelField(model, { id: 'slot-1-cartao' }), false);
  assert.equal(isAutomaticModelField({ id: 'encarte_1_0' }, { id: 'slot-1-nome' }), false);
});

test('renderer draws movable empty photo slots only in reusable models', async () => {
  const labels = [], rectangles = [];
  const ctx = {
    scale() {}, save() {}, restore() {}, translate() {}, beginPath() {}, rect() {}, clip() {},
    fillRect(...args) { rectangles.push(args); }, fillText(...args) { labels.push(args); },
  };
  const canvas = { getContext: () => ctx };
  const photo = { id: 'slot-1-foto', type: 'image', src: '', x: 50, y: 120, width: 300, height: 400 };
  const model = { ...createDesign(), id: 'modelo_sample', elements: [photo] };
  await renderDesign(canvas, model);
  assert.deepEqual(rectangles.at(-1), [0, 0, 300, 400]);
  assert.deepEqual(labels.at(-1), ['Foto do produto', 150, 200, 270]);
  await assert.rejects(renderDesign(canvas, { ...model, id: 'encarte_1_0' }), /Selecione uma imagem/);
  await assert.rejects(renderDesign(canvas, { ...model, elements: [{ ...photo, id: 'decoration' }] }), /Selecione uma imagem/);
});

test('model studio labels reflect reusable saving without changing normal artwork labels', () => {
  const state = { design: { id: 'modelo_sample', title: 'Natal' }, saveMessage: 'Arte salva', zoom: 'fit', tool: 'text' };
  assert.match(studioMarkup(state), /Salvar modelo/);
  assert.match(studioMarkup(state), /Modelo salvo/);
  assert.match(studioMarkup(state), /Nome do modelo/);
  assert.match(studioMarkup(state), /Baixar modelo/);
  assert.doesNotMatch(studioMarkup({ ...state, design: { id: 'plain', title: 'Arte' } }), /Salvar modelo/);
});

test('opening a saved model flushes the previous editor before adopting a fresh edit version', async () => {
  const order = [];
  const supplied = { id: 'modelo_sample', _version: 2 };
  const fresh = { ...supplied, _version: 3 };
  const result = await prepareEditorDesign({ isConnected: true }, supplied, {
    flush: async () => { order.push('flush'); return true; },
    read: async id => { order.push(`read:${id}`); return fresh; },
    currentScope: () => 'company:user', editorRuntime: {},
  });
  assert.deepEqual(order, ['flush', 'read:modelo_sample']);
  assert.equal(result, fresh);
});

test('an unsuccessful flush does not refresh edit versions, and unsaved models are not read remotely', async () => {
  let reads = 0;
  const supplied = { id: 'modelo_sample', _version: 2 };
  const options = { flush: async () => false, read: async () => { reads++; }, currentScope: () => 'same', editorRuntime: {} };
  await assert.rejects(prepareEditorDesign({ isConnected: true }, supplied, options), /Salve a arte/);
  assert.equal(reads, 0);
  const unsaved = { id: 'modelo_new' };
  assert.equal(await prepareEditorDesign({ isConnected: true }, unsaved, { ...options, flush: async () => true }), unsaved);
  assert.equal(reads, 0);
});

test('session changes while flushing prevent opening another account document', async () => {
  let scope = 'first', reads = 0;
  await assert.rejects(prepareEditorDesign({ isConnected: true }, { id: 'modelo_sample', _version: 2 }, {
    flush: async () => { scope = 'second'; return true; },
    read: async () => { reads++; }, currentScope: () => scope, editorRuntime: {},
  }), /sessão mudou/);
  assert.equal(reads, 0);
});

test('downloaded model JSON preserves editable slots, geometry and fonts for import', async () => {
  const model = createBlankFlyerModel({ presetId: 'natal' });
  const name = model.elements.find(element => element.id === 'slot-1-nome');
  name.fontSize = 19;
  const photo = model.elements.find(element => element.id === 'slot-1-foto');
  photo.width = 350;
  const blob = createModelJsonBlob(model);
  assert.equal(blob.type, 'application/json');
  const restored = validateFlyerModel(JSON.parse(await blob.text()));
  assert.equal(restored.id, model.id);
  assert.equal(restored.elements.find(element => element.id === name.id).fontSize, 19);
  assert.equal(restored.elements.find(element => element.id === photo.id).width, 350);
});

test('a 300-character name fits the actual 12-product Story model without omitted characters', () => {
  const model = createBlankFlyerModel({ presetId: 'natal', templateId: 'grid-12', formatId: 'story' });
  const field = model.elements.find(element => element.id === 'slot-1-nome');
  const ctx = { measureText(value) { return { width: Array.from(value).length * Number(this.font.match(/([\d.]+)px/)[1]) * 0.65 }; } };
  for (const text of [Array(100).fill('PRODUTO').join(' ').slice(0, 300), 'W'.repeat(300)]) {
    const result = fitTextLayout(ctx, text, field.width, field.height, {
      size: field.fontSize, family: field.fontFamily, weight: field.fontWeight, autoFit: true,
    });
    assert.ok(result.lines.length * result.lineHeight <= field.height);
    assert.ok(result.lines.every(line => ctx.measureText(line).width <= field.width));
    assert.equal(result.lines.join('').replaceAll(' ', ''), text.replaceAll(' ', ''));
    assert.ok(result.size > 1);
  }
});
