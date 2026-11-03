import test from 'node:test';
import assert from 'node:assert/strict';
import { layerDropOffset, moveLayer } from '../interno/encartes/editor/layer-reorder.js';
import { createHistory } from '../interno/encartes/model.js';

test('moving layers several positions preserves intermediate order and the original elements', () => {
  const elements = ['background', 'price', 'description', 'frame'].map(id => ({ id }));
  const frame = elements[3];
  assert.equal(moveLayer(elements, 'frame', -3), true);
  assert.deepEqual(elements.map(element => element.id), ['frame', 'background', 'price', 'description']);
  assert.equal(elements[0], frame);
  assert.equal(moveLayer(elements, 'frame', 2), true);
  assert.deepEqual(elements.map(element => element.id), ['background', 'price', 'frame', 'description']);
  assert.equal(moveLayer(elements, 'price', 1), true);
  assert.deepEqual(elements.map(element => element.id), ['background', 'frame', 'price', 'description']);
});

test('invalid moves and stack boundaries leave layers unchanged', () => {
  const elements = [{ id: 'back' }, { id: 'front', locked: true }];
  const before = structuredClone(elements);
  for (const [id, offset] of [['back', -1], ['front', 1], ['missing', -1], ['back', 0], ['back', .5], ['front', NaN]]) {
    assert.equal(moveLayer(elements, id, offset), false);
    assert.deepEqual(elements, before);
  }
  assert.equal(moveLayer(elements, 'front', -1), true);
  assert.equal(elements[0].locked, true, 'stack changes preserve the geometry lock');
});

test('visual insertion translates reversed rows into document offsets, including scrolled rows', () => {
  const rows = ['front', 'middle', 'back'].map((id, index) => ({
    dataset: { id }, getBoundingClientRect: () => ({ top: 200 + index * 60, height: 60 }),
  }));
  assert.equal(layerDropOffset(rows, 'front', 375), -2);
  assert.equal(layerDropOffset(rows, 'front', 310), -1);
  assert.equal(layerDropOffset(rows, 'front', 215), 0);
  assert.equal(layerDropOffset(rows, 'back', 215), 2);
  assert.equal(layerDropOffset(rows, 'middle', 280), 0);
  assert.equal(layerDropOffset(rows, 'removed', 215), 0);
});

test('one completed reorder is undoable and redoable without changing layer geometry', () => {
  const design = { elements: ['back', 'middle', 'front'].map(id => ({ id, x: 20, y: 30 })) };
  const history = createHistory(design);
  const next = structuredClone(design);
  moveLayer(next.elements, 'front', -2);
  history.commit(next);
  assert.deepEqual(history.undo(), design);
  assert.deepEqual(history.redo(), next);
});
