import test from 'node:test';
import assert from 'node:assert/strict';
import { bindEditorCanvas } from '../interno/encartes/editor/canvas-interaction.js';

async function setup() {
  const host = { isConnected: true },
    stage = {},
    state = { design: { elements: [{ id: 'layer', x: 10, y: 20, locked: false }] } };
  const changes = [],
    selections = [];
  let callbacks,
    active = true,
    draws = 0;
  const root = {
    isConnected: true,
    querySelector: (selector) =>
      selector === '.flyer-interaction' ? host : selector === '.flyer-stage' ? stage : null,
  };
  await bindEditorCanvas({
    root,
    state,
    selected: () => state.design.elements[0],
    select: (id) => selections.push(id),
    update: (design) => changes.push(design),
    requestDraw: () => draws++,
    mutate: () => {},
    message: () => {},
    isCurrent: () => active,
    createInteraction: async (options) => {
      callbacks = options;
      return { destroy() {} };
    },
  });
  return {
    state,
    changes,
    selections,
    callbacks,
    host,
    stage,
    draws: () => draws,
    stop: () => {
      active = false;
    },
  };
}

test('finishing a drag commits an independent design snapshot and keeps live preview updates responsive', async () => {
  const env = await setup();
  env.callbacks.onChange('layer', { x: 40 }, false);
  assert.equal(env.state.design.elements[0].x, 40);
  assert.equal(env.draws(), 1);
  assert.equal(env.changes.length, 0);
  env.callbacks.onChange('layer', { x: 75 }, true);
  assert.equal(env.changes[0].elements[0].x, 75);
  env.state.design.elements[0].x = 100;
  assert.equal(env.changes[0].elements[0].x, 75);
});

test('a canvas disposed by navigation cannot edit or select a layer in another document', async () => {
  const env = await setup();
  env.stop();
  env.callbacks.onChange('layer', { x: 999 }, true);
  env.callbacks.onSelect('layer');
  env.callbacks.onEdit('layer');
  assert.equal(env.state.design.elements[0].x, 10);
  assert.deepEqual(env.changes, []);
  assert.deepEqual(env.selections, []);
});
