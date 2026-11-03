import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, createHistory, cloneDesignState } from '../interno/encartes/model.js';

test('history isolates layer geometry while retaining exact image content across undo and redo', () => {
  const image = 'data:image/png;base64,' + 'A'.repeat(1_048_576);
  const design = {
    ...createDesign(),
    elements: [{ id: 'photo', type: 'image', src: image, x: 10, y: 20, width: 100, height: 100 }],
  };
  const history = createHistory(design);
  design.elements[0].x = 50;
  assert.equal(history.current().elements[0].x, 10);
  history.commit(design);
  design.elements[0].src = 'changed outside history';
  const undo = history.undo();
  assert.equal(undo.elements[0].x, 10);
  undo.elements[0].src = 'changed read';
  const redo = history.redo();
  assert.equal(redo.elements[0].src, image);
  assert.equal(redo.elements[0].x, 50);
});

test('equivalent document values do not create history steps and copies isolate nested plain state', () => {
  const original = {
    ...createDesign(),
    elements: [{ id: 'text', type: 'text', text: 'Oferta', x: 1, meta: { tags: ['a'] } }],
  };
  const copy = cloneDesignState(original);
  copy.elements[0].meta.tags.push('b');
  assert.deepEqual(original.elements[0].meta.tags, ['a']);
  const history = createHistory(original);
  history.commit(cloneDesignState(original));
  assert.equal(history.canUndo(), false);
  history.commit({ ...original, title: 'Outra oferta' });
  history.undo();
  history.commit({ ...original, title: 'Novo caminho' });
  assert.equal(history.canRedo(), false);
});
