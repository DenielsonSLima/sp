import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStudioZoom, normalizeZoom, wheelZoom } from '../interno/encartes/editor/zoom.js';
import { studioMarkup } from '../interno/encartes/views/studio.js';

function setup(initial = '100') {
  const frames = new Map();
  let sequence = 0, drawFrame = null;
  const win = {
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  const controls = [new EventTarget(), new EventTarget()];
  controls.forEach((control) => {
    control.custom = {};
    control.querySelector = () => control.custom;
  });
  const state = { zoom: initial, design: { width: 1080, height: 1920, elements: [{ id: 'unchanged' }] } };
  let scale = initial === 'fit' ? 0.25 : Number(initial) / 100;
  const stage = Object.assign(new EventTarget(), {
    clientWidth: 600, clientHeight: 650, clientLeft: 0, clientTop: 0,
    scrollLeft: 300, scrollTop: 400,
    getBoundingClientRect: () => ({ left: 30, top: 100, width: 600, height: 650 }),
  });
  const board = {
    getBoundingClientRect: () => ({
      left: 54 - stage.scrollLeft, top: 124 - stage.scrollTop,
      width: 1080 * scale, height: 1920 * scale,
    }),
  };
  const root = {
    isConnected: true, ownerDocument: { defaultView: win },
    querySelector: (selector) => selector === '.flyer-stage' ? stage : board,
    querySelectorAll: () => controls,
  };
  let draws = 0;
  const renderer = { requestDraw() {
    if (drawFrame !== null) return;
    drawFrame = win.requestAnimationFrame(() => {
      drawFrame = null;
      draws++;
      scale = state.zoom === 'fit' ? 0.25 : Number(state.zoom) / 100;
    });
  } };
  const dispose = bindStudioZoom(root, { renderer, state });
  const flush = () => {
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  };
  const wheel = (deltaY, extra = {}) => {
    const event = new Event('wheel', { cancelable: true });
    Object.entries({ deltaY, deltaMode: 0, clientX: 260, clientY: 330, ...extra }).forEach(([key, value]) =>
      Object.defineProperty(event, key, { value }),
    );
    stage.dispatchEvent(event);
    return event;
  };
  return { controls, state, stage, board, root, frames, dispose, flush, wheel, draws: () => draws };
}

test('top and bottom zoom controls stay synchronized, including wheel percentages and fit', () => {
  const env = setup();
  const artwork = structuredClone(env.state.design);
  env.controls[0].value = '75';
  env.controls[0].dispatchEvent(new Event('change'));
  assert.equal(env.state.zoom, '75');
  assert.equal(env.controls[1].value, '75');
  env.flush();
  const wheel = env.wheel(-30);
  assert.equal(wheel.defaultPrevented, true);
  assert.equal(env.state.zoom, '79.6');
  assert(env.controls.every((control) => control.value === '79.6' && !control.custom.hidden));
  env.flush();
  env.controls[1].value = 'fit';
  env.controls[1].dispatchEvent(new Event('change'));
  assert.equal(env.controls[0].value, 'fit');
  assert(env.controls.every((control) => control.custom.hidden));
  assert.deepEqual(env.state.design, artwork);
  env.dispose();
});

test('mouse wheel needs no Ctrl and preserves the document point below the cursor', () => {
  const env = setup();
  const before = env.board.getBoundingClientRect();
  const docX = (260 - before.left) / before.width;
  const docY = (330 - before.top) / before.height;
  const event = env.wheel(-100, { ctrlKey: false });
  env.flush();
  const after = env.board.getBoundingClientRect();
  assert(event.defaultPrevented);
  assert(Number(env.state.zoom) > 100);
  assert(Math.abs(after.left + after.width * docX - 260) < 0.00001);
  assert(Math.abs(after.top + after.height * docY - 330) < 0.00001);
  assert.equal(env.draws(), 1);
  env.dispose();
});

test('fit zoom starts from measured board size; limits and wheel delta modes are bounded', () => {
  const env = setup('fit');
  env.wheel(-100);
  assert.equal(env.state.zoom, '30.5');
  assert.equal(normalizeZoom('fit'), 'fit');
  assert.equal(normalizeZoom('invalid'), null);
  assert.equal(normalizeZoom('-5'), null);
  assert.equal(normalizeZoom('400'), '300');
  assert.equal(normalizeZoom('1'), '10');
  assert.equal(wheelZoom(300, -9000), '300');
  assert.equal(wheelZoom(10, 9000), '10');
  assert.equal(wheelZoom(100, 1, 1), wheelZoom(100, 16));
  assert.equal(wheelZoom(100, 1, 2, 600), wheelZoom(100, 120));
  env.dispose();
});

test('wheel over editable content is untouched and disposal cancels anchoring and handlers', () => {
  const env = setup();
  const editing = env.wheel(-100, { target: { closest: () => ({}) } });
  assert.equal(editing.defaultPrevented, false);
  assert.equal(env.state.zoom, '100');
  assert.equal(env.wheel(0).defaultPrevented, false);
  env.wheel(-100);
  const position = [env.stage.scrollLeft, env.stage.scrollTop];
  env.dispose();
  env.flush();
  assert.deepEqual([env.stage.scrollLeft, env.stage.scrollTop], position);
  const previous = env.state.zoom;
  assert.equal(env.wheel(100).defaultPrevented, false);
  env.controls[0].value = '10';
  env.controls[0].dispatchEvent(new Event('change'));
  assert.equal(env.state.zoom, previous);
});

test('studio exposes zoom selectors in both toolbars and describes direct wheel zoom', () => {
  const html = studioMarkup({ design: { title: 'Oferta' }, saveMessage: '', tool: 'text', zoom: 'fit' });
  assert.equal((html.match(/class="flyer-zoom-select"/g) || []).length, 2);
  assert.match(html, /Zoom da arte — barra superior/);
  assert.match(html, /Zoom da arte — rodapé/);
  assert.match(html, /Role sobre a arte para dar zoom/);
});
