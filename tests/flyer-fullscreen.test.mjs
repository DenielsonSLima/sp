import test from 'node:test';
import assert from 'node:assert/strict';
import { bindStudioFullscreen } from '../interno/encartes/editor/fullscreen.js';

function element(tagName = 'DIV') {
  const classes = new Set(),
    listeners = new Map(),
    attributes = new Map();
  return {
    tagName,
    children: [],
    parentElement: null,
    isConnected: true,
    inert: false,
    textContent: '',
    focuses: 0,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    getAttribute: (name) => attributes.get(name),
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
    dispatch(name, event = {}) {
      listeners.get(name)?.forEach((listener) => listener(event));
    },
    focus(options) {
      this.focuses++;
      this.focusOptions = options;
    },
    append(...nodes) {
      this.children.push(...nodes);
      nodes.forEach((node) => (node.parentElement = this));
    },
  };
}

function setup() {
  const page = element('HTML'),
    body = element('BODY'),
    navigation = element('NAV'),
    root = element(),
    studio = element('SECTION'),
    heading = element('HEADER'),
    button = element('BUTTON'),
    label = element('SPAN'),
    canvas = element('CANVAS'),
    focus = element('INPUT'),
    doc = element('DOCUMENT');
  const frames = new Map(),
    scrolls = [];
  let nextFrame = 0,
    resizes = 0,
    modal = null;
  const win = {
    scrollX: 5,
    scrollY: 440,
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    scrollTo: (options) => scrolls.push(options),
  };
  page.append(body);
  body.append(navigation, root);
  root.append(heading, studio);
  studio.append(button, canvas);
  button.append(label);
  button.querySelector = () => label;
  studio.querySelectorAll = () => [];
  doc.getElementById = () => null;
  root.querySelector = (selector) => (selector === '.flyer-studio' ? studio : button);
  doc.querySelector = () => modal;
  Object.assign(doc, { documentElement: page, body, defaultView: win, activeElement: focus });
  studio.ownerDocument = doc;
  const dispose = bindStudioFullscreen(root, { onResize: () => resizes++ });
  return {
    page,
    body,
    navigation,
    root,
    studio,
    heading,
    button,
    label,
    canvas,
    doc,
    focus,
    scrolls,
    dispose,
    resizes: () => resizes,
    frames: () => frames.size,
    modal: (value) => (modal = value),
    flush() {
      const queued = [...frames.values()];
      frames.clear();
      queued.forEach((callback) => callback());
    },
    escape() {
      const event = {
        key: 'Escape',
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      doc.dispatch('keydown', event);
      return event;
    },
  };
}

test('expanded mode preserves the artwork DOM and restores page scroll, focus and underlying controls', () => {
  const env = setup();
  env.heading.inert = true;
  const originalChildren = [...env.studio.children];
  env.button.dispatch('click');
  assert.equal(env.studio.classList.contains('is-fullscreen'), true);
  assert.equal(env.page.classList.contains('flyer-fullscreen-open'), true);
  assert.equal(env.body.classList.contains('flyer-fullscreen-open'), true);
  assert.equal(env.button.getAttribute('aria-pressed'), 'true');
  assert.equal(env.label.textContent, 'Sair da tela cheia');
  assert.equal(env.navigation.inert, true);
  assert.equal(env.heading.inert, true);
  assert.deepEqual(env.studio.children, originalChildren);
  env.flush();
  assert.equal(env.resizes(), 1);
  assert.equal(env.escape().defaultPrevented, true);
  env.flush();
  assert.equal(env.resizes(), 2);
  assert.equal(env.studio.classList.contains('is-fullscreen'), false);
  assert.equal(env.navigation.inert, false);
  assert.equal(env.heading.inert, true);
  assert.equal(env.focus.focuses, 1);
  assert.deepEqual(env.focus.focusOptions, { preventScroll: true });
  assert.deepEqual(env.scrolls, [{ left: 5, top: 440, behavior: 'instant' }]);
  assert.equal(env.label.textContent, 'Tela cheia');
  env.dispose();
});

test('Esc closes a body-mounted modal before it leaves expanded studio mode', () => {
  const env = setup();
  env.button.dispatch('click');
  const dialog = element('DIALOG');
  env.body.append(dialog);
  env.modal(dialog);
  assert.equal(dialog.inert, false);
  assert.equal(env.escape().defaultPrevented, false);
  assert.equal(env.studio.classList.contains('is-fullscreen'), true);
  env.modal(null);
  env.escape();
  assert.equal(env.studio.classList.contains('is-fullscreen'), false);
  env.dispose();
});

test('disposing an expanded editor unlocks its page and cancels callbacks without restoring obsolete focus', () => {
  const env = setup();
  env.body.classList.add('flyer-fullscreen-open');
  env.button.dispatch('click');
  assert.equal(env.frames(), 1);
  env.studio.isConnected = false;
  env.dispose();
  env.dispose();
  env.flush();
  assert.equal(env.resizes(), 0);
  assert.equal(env.frames(), 0);
  assert.equal(env.page.classList.contains('flyer-fullscreen-open'), false);
  assert.equal(env.body.classList.contains('flyer-fullscreen-open'), true);
  assert.equal(env.navigation.inert, false);
  assert.equal(env.focus.focuses, 0);
  env.button.dispatch('click');
  assert.equal(env.escape().defaultPrevented, false);
  assert.equal(env.studio.classList.contains('is-fullscreen'), false);
});

test('selectors created before fullscreen keep only their studio-owned body popups interactive', () => {
  const env = setup();
  const popup = element(),
    unrelatedPopup = element(),
    trigger = element('BUTTON'),
    list = element();
  trigger.setAttribute('aria-controls', 'zoom-options');
  list.closest = (selector) => (selector === '.custom-select-popup' ? popup : null);
  env.studio.querySelectorAll = () => [trigger];
  env.doc.getElementById = (id) => (id === 'zoom-options' ? list : null);
  env.body.append(popup, unrelatedPopup);
  env.button.dispatch('click');
  assert.equal(popup.inert, false);
  assert.equal(unrelatedPopup.inert, true);
  // A selector's target keydown handler consumes Escape before it reaches document.
  const escape = {
    key: 'Escape',
    defaultPrevented: true,
    preventDefault() {
      throw new Error('already consumed');
    },
  };
  env.doc.dispatch('keydown', escape);
  assert.equal(env.studio.classList.contains('is-fullscreen'), true);
  env.escape();
  assert.equal(popup.inert, false);
  assert.equal(unrelatedPopup.inert, false);
  env.dispose();
});
