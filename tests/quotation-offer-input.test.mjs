import test from 'node:test';
import assert from 'node:assert/strict';
import { attachOfferInput } from '../interno/cotacao/offer-input.js';

class Input extends EventTarget {
  constructor(value = '') {
    super();
    this.value = value;
    this.selectionStart = this.selectionEnd = value.length;
    this.validationMessage = '';
    this.form = {};
  }
  removeAttribute() {}
  setAttribute() {}
  setCustomValidity(message) { this.validationMessage = message; }
  checkValidity() { return !this.validationMessage; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  dispatchEvent(event) {
    const result = super.dispatchEvent(event);
    this[`on${event.type}`]?.(event);
    return result;
  }
  type(data) {
    const event = new Event('beforeinput', { cancelable: true });
    Object.defineProperties(event, { inputType: { value: 'insertText' }, data: { value: data } });
    this.dispatchEvent(event);
  }
  replace(data) {
    this.setSelectionRange(0, this.value.length);
    this.type(data);
  }
}

function setup({ value = '', savedValue = value, save = async () => {} } = {}) {
  const input = new Input(value), drafts = [], saved = [], errors = [], calls = [];
  attachOfferInput(input, {
    savedValue,
    save: async (value) => { calls.push(value); await save(value); },
    onDraft: value => drafts.push(value),
    onSaving() {},
    onSaved: value => saved.push(value),
    onError: error => errors.push(error.message),
  });
  return { input, drafts, saved, errors, calls };
}

test('prices format as cents while typing and save once on leaving, including Enter plus blur', async () => {
  const { input, drafts, calls, saved } = setup();
  for (const digit of '1234') input.type(digit);
  assert.deepEqual(drafts, ['0,01', '0,12', '1,23', '12,34']);
  assert.deepEqual(calls, []);
  const pending = input.form.onsubmit({ preventDefault() {} });
  await input.onblur();
  await pending;
  assert.deepEqual(calls, ['12.34']);
  assert.deepEqual(saved, ['12,34']);
  assert.equal(input.value, '12,34');
});

test('a failed save preserves the visible price and can be retried by leaving again', async () => {
  let attempts = 0;
  const { input, calls, errors, saved } = setup({ save: async () => {
    if (++attempts === 1) throw Error('Sem conexão');
  } });
  input.type('1290');
  await input.onblur();
  assert.equal(input.value, '12,90');
  assert.deepEqual(saved, []);
  assert.deepEqual(errors, ['Sem conexão']);
  await input.onblur();
  assert.deepEqual(calls, ['12.90', '12.90']);
  assert.deepEqual(saved, ['12,90']);
});

test('a newer edit is saved after the in-flight value without overlapping writes', async () => {
  let release;
  const { input, calls, saved } = setup({ save: () => new Promise(resolve => { release = resolve; }) });
  input.type('1234');
  const pending = input.onblur();
  input.replace('5678');
  input.onblur();
  assert.deepEqual(calls, ['12.34']);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['12.34', '56.78']);
  assert.equal(input.value, '56,78');
  release();
  await pending;
  assert.deepEqual(saved, ['12,34', '56,78']);
});

test('clearing removes a saved price and restored drafts still save on leaving', async () => {
  const { input, calls } = setup({ value: '12,34' });
  input.value = '';
  input.dispatchEvent(new Event('input'));
  await input.onblur();
  assert.deepEqual(calls, ['']);
  const restored = setup({ value: '56,78', savedValue: '12,34' });
  await restored.input.onblur();
  assert.deepEqual(restored.calls, ['56.78']);
});

test('quotation mask retains the existing million-real range and canonicalizes pasted thousands', async () => {
  const { input, calls } = setup();
  const event = new Event('paste', { cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'R$ 1.000.000,00' } });
  input.dispatchEvent(event);
  assert.equal(input.value, '1.000.000,00');
  await input.onblur();
  assert.deepEqual(calls, ['1000000.00']);
});
