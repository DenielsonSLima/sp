import test from 'node:test';
import assert from 'node:assert/strict';
import { visualBBox, snapElementPosition, centralizeElement } from '../interno/encartes/editor/alignment.js';
import { createCanvasInteraction } from '../interno/encartes/interaction.js';

const design = { width: 1000, height: 800, elements: [] };
const element = (overrides = {}) => ({
  id: 'layer',
  x: 395,
  y: 347,
  width: 200,
  height: 100,
  rotation: 0,
  ...overrides,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≠ ${expected}`);

test('drag snapping aligns layer center and visual edges with page and custom guides', () => {
  const centered = snapElementPosition(element(), design);
  assert.deepEqual(centered, { x: 400, y: 350, lines: { x: [500], y: [400] } });
  const left = snapElementPosition(element({ x: 204, y: 100, width: 100 }), design, { guides: { x: [200] } });
  assert.equal(left.x, 200);
  assert.deepEqual(left.lines.x, [200]);
  const right = snapElementPosition(element({ x: 196, y: 100, width: 100 }), design, { guides: { x: [300] } });
  assert.equal(right.x, 200);
  const bottom = snapElementPosition(element({ x: 100, y: 696 }), design);
  assert.equal(bottom.y, 700);
  assert.deepEqual(bottom.lines.y, [800]);
});

test('snap tolerance stays six CSS pixels at different zooms and Alt disables alignment', () => {
  assert.equal(snapElementPosition(element({ x: 377 }), design, { scale: 0.25 }).x, 400);
  assert.equal(snapElementPosition(element({ x: 396 }), design, { scale: 2 }).x, 396);
  assert.equal(snapElementPosition(element({ x: 397 }), design, { scale: 2 }).x, 400);
  const free = snapElementPosition(element(), design, { disabled: true });
  assert.deepEqual(free, { x: 395, y: 347, lines: { x: [], y: [] } });
  const bounded = snapElementPosition(element({ x: -20, y: 900 }), design, { disabled: true });
  assert.equal(bounded.x, 0);
  assert.equal(bounded.y, 700);
});

test('rotated visual bounds snap without changing size or rotation or promising an impossible alignment', () => {
  const rotated = element({ x: 349, y: 120, rotation: 45 });
  const box = visualBBox(rotated);
  near(box.width, 300 / Math.sqrt(2));
  const guide = box.x + box.width + 4;
  const snapped = snapElementPosition(rotated, design, { guides: { x: [guide] } });
  near(snapped.x, rotated.x + 4);
  near(visualBBox({ ...rotated, x: snapped.x }).x + box.width, guide);
  const impossible = snapElementPosition(element({ x: 1, y: 100, rotation: 90 }), design, { guides: { x: [47] } });
  assert.equal(impossible.x, 1);
  assert.deepEqual(impossible.lines.x, []);
  const locked = element({ locked: true });
  assert.deepEqual(snapElementPosition(locked, design), { x: 395, y: 347, lines: { x: [], y: [] } });
});

test('explicit centering clones the design and preserves rotation, locks, dimensions and unrelated layers', () => {
  const original = { ...design, elements: [element({ rotation: 73 }), element({ id: 'locked', locked: true })] };
  const centered = centralizeElement(original, 'layer');
  assert.equal(centered.elements[0].x, 400);
  assert.equal(centered.elements[0].y, 350);
  assert.equal(centered.elements[0].rotation, 73);
  assert.equal(centered.elements[0].width, 200);
  assert.equal(original.elements[0].x, 395);
  assert.deepEqual(centered.elements[1], original.elements[1]);
  const horizontal = centralizeElement(original, 'layer', 'horizontal');
  assert.equal(horizontal.elements[0].y, 347);
  assert.deepEqual(centralizeElement(original, 'locked'), original);
});

function fakeKonva() {
  const rects = [];
  class Node {
    constructor(attrs = {}) {
      this.attrs = { scaleX: 1, scaleY: 1, ...attrs };
      this.events = new Map();
    }
    on(names, callback) {
      names.split(' ').forEach((name) => this.events.set(name, callback));
    }
    fire(name, event = {}) {
      this.events.get(name)?.(event);
    }
    add() {}
    setAttrs(attrs) {
      Object.assign(this.attrs, attrs);
    }
    x() {
      return this.attrs.x;
    }
    y() {
      return this.attrs.y;
    }
    width() {
      return this.attrs.width;
    }
    height() {
      return this.attrs.height;
    }
    rotation() {
      return this.attrs.rotation;
    }
    scaleX() {
      return this.attrs.scaleX;
    }
    scaleY() {
      return this.attrs.scaleY;
    }
    position(point) {
      this.setAttrs(point);
    }
    getClientRect(options) {
      assert.equal(options.skipStroke, true);
      assert.ok(options.relativeTo instanceof Node);
      return visualBBox({ ...this.attrs, x: this.x() - this.width() / 2, y: this.y() - this.height() / 2 });
    }
    zIndex() {}
    nodes() {}
    resizeEnabled() {}
    rotateEnabled() {}
    moveToTop() {}
    batchDraw() {}
    size() {}
    scale() {}
    destroy() {}
  }
  class Rect extends Node {
    constructor(attrs) {
      super(attrs);
      rects.push(this);
    }
  }
  return { api: { Stage: Node, Layer: Node, Transformer: Node, Rect }, rects };
}

test('Konva drag snaps its actual node position, reports lines, clears them on commit and honors Alt/locks', async () => {
  const previous = globalThis.Konva,
    fake = fakeKonva();
  globalThis.Konva = fake.api;
  const artwork = { ...design, elements: [element()] },
    changes = [],
    lines = [];
  try {
    const host = { isConnected: true, style: {} };
    const interaction = await createCanvasInteraction({
      host,
      onSelect() {},
      onEdit() {},
      onChange(id, patch, commit) {
        changes.push({ id, patch, commit });
        Object.assign(artwork.elements[0], patch);
      },
      getGuides: () => ({ x: [300] }),
      onSnap: (next) => lines.push(next),
    });
    interaction.sync(artwork, 'layer', 0.5);
    const node = fake.rects[0];
    node.fire('dragstart');
    node.position({ x: 295, y: 397 });
    node.fire('dragmove', { evt: {} });
    assert.equal(node.x(), 300);
    assert.equal(node.y(), 400);
    assert.deepEqual(lines.at(-1), { x: [300], y: [400] });
    assert.equal(changes.at(-1).patch.x, 200);
    node.fire('dragend');
    assert.equal(changes.at(-1).commit, true);
    assert.deepEqual(lines.at(-1), { x: [], y: [] });
    node.fire('dragstart');
    node.position({ x: 295, y: 397 });
    node.fire('dragmove', { evt: { altKey: true } });
    assert.equal(node.x(), 295);
    assert.deepEqual(lines.at(-1), { x: [], y: [] });
    artwork.elements[0].locked = true;
    const count = changes.length;
    node.fire('dragmove', { evt: {} });
    assert.equal(changes.length, count);
    interaction.destroy();
  } finally {
    globalThis.Konva = previous;
  }
});
