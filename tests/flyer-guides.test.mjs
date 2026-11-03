import test from "node:test";
import assert from "node:assert/strict";
import { createGuides, guidePositions, normalizeGuides, pointerToGuide } from "../interno/encartes/editor/guides.js";

test("guides use document pixels at fractional zoom, centered and scrolled origins", () => {
  for (const scale of [0.25, 0.3333, 0.75, 1, 2.5]) {
    const bounds = { left: -173.5, top: 87.25, width: 1080 * scale, height: 1920 * scale };
    for (const [axis, value] of [
      ["x", 540],
      ["y", 960],
    ]) {
      const result = pointerToGuide({
        axis,
        width: 1080,
        height: 1920,
        bounds,
        clientX: bounds.left + 540 * scale,
        clientY: bounds.top + 960 * scale,
      });
      assert.deepEqual(result, { value, inside: true });
    }
  }
});

test("dropping outside any edge is distinguishable from placing a guide at zero", () => {
  const config = { axis: "x", width: 1080, height: 1920, bounds: { left: 100, top: 200, width: 540, height: 960 } };
  assert.deepEqual(pointerToGuide({ ...config, clientX: 100, clientY: 200 }), { value: 0, inside: true });
  for (const [clientX, clientY] of [
    [99, 400],
    [641, 400],
    [300, 199],
    [300, 1161],
  ]) {
    assert.equal(pointerToGuide({ ...config, clientX, clientY }).inside, false);
  }
  assert.equal(pointerToGuide({ ...config, bounds: { width: 0, height: 0 } }), null);
});

test("guide centers follow art dimensions, remain optional and do not duplicate custom guides", () => {
  const custom = { x: [540, 100], y: [500] };
  assert.deepEqual(guidePositions(custom, 1080, 1920), { x: [100, 540], y: [500, 960] });
  assert.deepEqual(guidePositions(custom, 1080, 1920, false), { x: [100, 540], y: [500] });
  assert.deepEqual(guidePositions({ x: [], y: [] }, 1200, 800), { x: [600], y: [400] });
  assert.deepEqual(custom, { x: [540, 100], y: [500] });
});

test("restored guide state ignores invalid/outside coordinates without mutating its source", () => {
  const source = { x: [100, 100, 0, 1080, -1, NaN, Infinity, 1081], y: [1.5, "2", null] };
  assert.deepEqual(normalizeGuides(source, { width: 1080, height: 1920 }), { x: [0, 100, 1080], y: [1.5] });
  assert.equal(source.x.length, 8);
});

function guideEnvironment() {
  const frames = new Map();
  let frameId = 0;
  class Node extends EventTarget {
    children = [];
    style = {};
    dataset = {};
    attributes = {};
    isConnected = true;
    append(...children) {
      children.forEach((child) => {
        child.parent = this;
        this.children.push(child);
      });
    }
    remove() {
      this.isConnected = false;
      this.parent.children = this.parent.children.filter((node) => node !== this);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    contains(node) {
      return this.children.includes(node);
    }
    closest() {
      return this.dataset.guideAxis ? this : null;
    }
  }
  const win = new EventTarget();
  win.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  const stage = new Node();
  stage.ownerDocument = { defaultView: win, createElement: () => new Node() };
  const board = { getBoundingClientRect: () => ({ left: 100, top: 50, width: 540, height: 960 }) };
  stage.querySelector = () => board;
  stage.getBoundingClientRect = () => ({ left: 0, top: 0 });
  Object.assign(stage, {
    clientWidth: 800,
    clientHeight: 1100,
    clientLeft: 0,
    clientTop: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  stage.setPointerCapture = (id) => {
    stage.capture = id;
  };
  stage.releasePointerCapture = () => {
    stage.capture = null;
  };
  const dispatch = (target, type, properties) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    target.dispatchEvent(event);
  };
  const flush = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback();
    }
  };
  return {
    stage,
    win,
    dispatch,
    flush,
    frames,
    line: () => stage.children[0].children[0].children.find((node) => node.dataset.guideAxis),
  };
}

test("ruler drag creates, moves, removes and cancels a guide without emitting restoration changes", () => {
  const env = guideEnvironment(),
    changes = [];
  const guides = createGuides(env.stage, { onChange: (state) => changes.push(state) });
  guides.update({ width: 1080, height: 1920, showCenter: false });
  env.flush();
  assert.equal(changes.length, 0);
  const create = () =>
    env.dispatch(env.stage, "flyer-guide-create", { detail: { axis: "y", pointerId: 1, clientX: 300, clientY: 10 } });
  create();
  env.dispatch(env.win, "pointerup", { pointerId: 1, clientX: 300, clientY: 250 });
  assert.deepEqual(guides.getGuidePositions(), { x: [], y: [400] });
  assert.equal(env.stage.capture, null);
  env.flush();
  env.line().onpointerdown({ pointerId: 2, clientX: 300, clientY: 250 });
  env.dispatch(env.win, "pointerup", { pointerId: 2, clientX: 300, clientY: 350 });
  assert.deepEqual(guides.getGuidePositions(), { x: [], y: [600] });
  env.flush();
  env.line().onpointerdown({ pointerId: 3, clientX: 300, clientY: 350 });
  env.dispatch(env.win, "pointercancel", { pointerId: 3 });
  assert.deepEqual(guides.getGuidePositions(), { x: [], y: [600] });
  assert.equal(changes.length, 2);
  env.line().onpointerdown({ pointerId: 4, clientX: 300, clientY: 350 });
  env.dispatch(env.win, "pointerup", { pointerId: 4, clientX: 300, clientY: 30 });
  assert.deepEqual(guides.getGuidePositions(), { x: [], y: [] });
  create();
  guides.destroy();
  assert.equal(env.frames.size, 0);
  env.dispatch(env.win, "pointerup", { pointerId: 1, clientX: 300, clientY: 250 });
  assert.equal(changes.length, 3);
  assert.equal(env.stage.children.length, 0);
});
