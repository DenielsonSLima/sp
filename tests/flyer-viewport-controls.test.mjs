import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStudioViewport } from '../interno/encartes/editor/viewport-controls.js';

function setup() {
  const doc = new EventTarget(),
    actions = ['horizontal', 'vertical', 'both'].map((axis) => ({ dataset: { align: axis } })),
    center = {},
    clear = {},
    button = {
      attributes: {},
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
      contains: (node) => node === button,
      focus() {
        this.focused = true;
      },
    },
    menu = {
      hidden: true,
      contains: (node) => node === menu || actions.includes(node),
      querySelector: (selector) => (selector === '[data-show-center]' ? center : clear),
      querySelectorAll: () => actions,
    },
    root = {
      ownerDocument: doc,
      querySelector: (selector) =>
        selector === '.flyer-guides-toggle' ? button : selector === '.flyer-guides-menu' ? menu : null,
    },
    state = {
      selection: 'layer',
      design: {
        width: 1000,
        height: 800,
        guides: { x: [100], y: [200] },
        elements: [{ id: 'layer', x: 20, y: 30, width: 200, height: 100 }],
      },
    },
    mutations = [];
  let showCenter = true,
    guideChanged = () => {};
  const renderer = {
    requestDraw() {},
    isCenterVisible: () => showCenter,
    setCenterVisible: (value) => {
      showCenter = value;
    },
    onGuideChange: (callback) => {
      guideChanged = callback;
    },
    clearGuides: () => guideChanged({ x: [], y: [] }),
  };
  const dispose = bindStudioViewport(root, {
    renderer,
    state,
    mutate: (change, options) => {
      change(state.design);
      mutations.push(options);
    },
  });
  return {
    doc,
    actions,
    center,
    clear,
    button,
    menu,
    state,
    renderer,
    mutations,
    dispose,
    guideChanged: (guides) => guideChanged(guides),
  };
}

test('viewport actions center the current layer and keep center-line visibility separate from saved artwork', () => {
  const env = setup();
  env.button.onclick();
  assert.equal(env.menu.hidden, false);
  assert.equal(env.center.checked, true);
  env.center.checked = false;
  env.center.onchange();
  assert.equal(env.renderer.isCenterVisible(), false);
  assert.equal(env.mutations.length, 0);
  env.actions[0].onclick();
  assert.equal(env.state.design.elements[0].x, 400);
  assert.equal(env.state.design.elements[0].y, 30);
  assert.deepEqual(env.state.design.guides, { x: [100], y: [200] });
  assert.equal(env.menu.hidden, true);
  env.state.design.elements[0].locked = true;
  env.button.onclick();
  assert.ok(env.actions.every((action) => action.disabled));
  env.state.selection = null;
  env.button.onclick();
  env.button.onclick();
  assert.ok(env.actions.every((action) => action.disabled));
  env.dispose();
});

test('guide changes and clearing update artwork once, and disposal releases the callback', () => {
  const env = setup();
  env.guideChanged({ x: [540], y: [960] });
  assert.deepEqual(env.state.design.guides, { x: [540], y: [960] });
  assert.deepEqual(env.mutations, [{ panel: false }]);
  env.clear.onclick();
  assert.deepEqual(env.state.design.guides, { x: [], y: [] });
  assert.equal(env.mutations.length, 2);
  env.dispose();
  env.guideChanged({ x: [200], y: [] });
  assert.equal(env.mutations.length, 2);
});

test('Escape closes the guides menu first and returns focus; listeners stop on disposal', () => {
  const env = setup();
  env.button.onclick();
  const escape = new Event('keydown', { cancelable: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  env.doc.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(env.menu.hidden, true);
  assert.equal(env.button.focused, true);
  assert.equal(env.button.attributes['aria-expanded'], 'false');
  env.button.onclick();
  env.dispose();
  env.doc.dispatchEvent(new Event('pointerdown'));
  assert.equal(env.menu.hidden, false);
});
